import OpenAI from "openai";
import type { ObjectId } from "mongodb";
import type { ScoredChunk } from "./retrieve.ts";

/** Spec §3: gpt-4o-mini for summarisation and MCQ generation. */
export const GENERATION_MODEL = "gpt-4o-mini";

/** The instruction embedded to retrieve chunks for a whole-document summary. */
export const SUMMARY_QUERY =
  "key concepts, definitions, and main ideas explained in this material";

export interface SummaryPoint {
  /** Topic heading the bullet sits under. */
  heading: string;
  /** One short bullet. Key terms are wrapped in **double asterisks**. */
  text: string;
  chunkId: ObjectId;
  sourcePage: number;
  endPage?: number;
}

let client: OpenAI | undefined;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set — add it to .env.local");
  return (client ??= new OpenAI({ apiKey }));
}

const SYSTEM_PROMPT = `You write revision notes from course material, the way a strong student would in their notebook.

Rules:
- Use ONLY the numbered excerpts provided. Never add facts from outside them.
- Group the notes into 3 to 6 topics, ordered as the material presents them. Give each a short heading (2 to 5 words).
- Under each topic write 2 to 5 bullets. A bullet is a short note, not an essay: one line, a fragment is fine ("Affordance: an object's shape suggests how to use it").
- Prefer definitions, lists of steps or types, and contrasts — the things a student would revise from.
- Wrap the single most important term in a bullet in **double asterisks**. At most one per bullet; none if nothing stands out.
- Set "source" on every bullet to the number of the excerpt it came from.`;

/**
 * Built per call so `source` is an enum of the excerpt numbers that actually
 * exist. Under strict structured outputs the model cannot emit anything else.
 *
 * Given excerpts labelled `[3] (page 21)` the model will answer with the page
 * number, and those citations get dropped as unresolvable — silently costing
 * notes. Constraining the value fixes that at the source.
 */
function responseSchema(excerptCount: number) {
  return {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string", description: "Short topic heading." },
            bullets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string", description: "One short revision note." },
                  source: {
                    type: "integer",
                    description: "Number of the excerpt this bullet came from.",
                    enum: Array.from({ length: excerptCount }, (_, i) => i + 1),
                  },
                },
                required: ["text", "source"],
                additionalProperties: false,
              },
            },
          },
          required: ["heading", "bullets"],
          additionalProperties: false,
        },
      },
    },
    required: ["sections"],
    additionalProperties: false,
  };
}

/**
 * Generates source-grounded revision notes from retrieved chunks.
 *
 * Only the retrieved excerpts go into the prompt — that restriction is what
 * keeps the output grounded (spec §6). The model returns an excerpt *number*,
 * never a chunk id; ids are mapped back here, so a citation can only point at a
 * chunk that was actually supplied (spec §9).
 *
 * Returned flat, each bullet carrying its heading, so storage stays a list of
 * cited points and the panel groups them for display.
 */
export async function generateSummary(retrieved: ScoredChunk[]): Promise<SummaryPoint[]> {
  if (retrieved.length === 0) return [];

  // No page number beside the index: a second number there is exactly what the
  // model mistakes for the citation. The page is attached from the chunk after.
  const excerpts = retrieved
    .map(({ chunk }, i) => `[${i + 1}]\n${chunk.text}`)
    .join("\n\n");

  const response = await getClient().chat.completions.create({
    model: GENERATION_MODEL,
    // Low but non-zero: these are factual notes, not creative writing.
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Excerpts:\n\n${excerpts}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "revision_notes",
        strict: true,
        schema: responseSchema(retrieved.length),
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("The model returned empty notes.");

  const parsed = JSON.parse(content) as {
    sections: { heading: string; bullets: { text: string; source: number }[] }[];
  };

  return parsed.sections.flatMap(({ heading, bullets }) =>
    bullets.flatMap<SummaryPoint>(({ text, source }) => {
      // Drop anything citing an excerpt we never sent rather than guessing at it.
      const cited = retrieved[source - 1];
      if (!cited || !text.trim()) return [];
      return [
        {
          heading: heading.trim() || "Notes",
          text: text.trim(),
          chunkId: cited.chunk._id,
          sourcePage: cited.chunk.sourcePage,
          endPage: cited.chunk.endPage,
        },
      ];
    }),
  );
}
