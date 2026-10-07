import OpenAI from "openai";
import type { ObjectId } from "mongodb";
import type { ScoredChunk } from "./retrieve.ts";

/** Spec §3: gpt-4o-mini for summarisation and MCQ generation. */
export const GENERATION_MODEL = "gpt-4o-mini";

/** The instruction embedded to retrieve chunks for a whole-document summary. */
export const SUMMARY_QUERY =
  "key concepts, definitions, and main ideas explained in this material";

export interface SummaryPoint {
  text: string;
  chunkId: ObjectId;
  sourcePage: number;
}

let client: OpenAI | undefined;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set — add it to .env.local");
  return (client ??= new OpenAI({ apiKey }));
}

const SYSTEM_PROMPT = `You write concise study notes from course material.

Rules:
- Use ONLY the numbered excerpts provided. Never add facts from outside them.
- If the excerpts don't support a point, leave it out.
- Each point must be a single self-contained study note, one or two sentences.
- Set "source" to the number of the excerpt the point came from.
- Write 4 to 8 points, ordered as the material presents them.`;

/**
 * The model returns an excerpt *number*, never a chunk id. Ids are mapped back
 * here, so a citation can only ever point at a chunk that was actually supplied
 * — the model has no way to invent one (spec §9 requires traceability).
 */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    points: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The study note." },
          source: {
            type: "integer",
            description: "Number of the excerpt this point came from.",
          },
        },
        required: ["text", "source"],
        additionalProperties: false,
      },
    },
  },
  required: ["points"],
  additionalProperties: false,
} as const;

/**
 * Generates source-grounded study notes from retrieved chunks.
 *
 * Only the retrieved excerpts go into the prompt — that restriction is what
 * keeps the output grounded (spec §6).
 */
export async function generateSummary(retrieved: ScoredChunk[]): Promise<SummaryPoint[]> {
  if (retrieved.length === 0) return [];

  const excerpts = retrieved
    .map(({ chunk }, i) => `[${i + 1}] (page ${chunk.sourcePage})\n${chunk.text}`)
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
      json_schema: { name: "study_notes", strict: true, schema: RESPONSE_SCHEMA },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("The model returned an empty summary.");

  const parsed = JSON.parse(content) as { points: { text: string; source: number }[] };

  return parsed.points.flatMap<SummaryPoint>(({ text, source }) => {
    // Drop anything citing an excerpt we never sent rather than guessing at it.
    const cited = retrieved[source - 1];
    if (!cited || !text.trim()) return [];
    return [
      {
        text: text.trim(),
        chunkId: cited.chunk._id,
        sourcePage: cited.chunk.sourcePage,
      },
    ];
  });
}
