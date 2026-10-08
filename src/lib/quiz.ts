import OpenAI from "openai";
import type { ObjectId } from "mongodb";
import type { ScoredChunk } from "./retrieve.ts";
import { GENERATION_MODEL } from "./summarise.ts";
import type { Difficulty } from "./schema.ts";

/** Spec §2: 10–20 questions per quiz. */
export const MIN_QUESTIONS = 10;
export const MAX_QUESTIONS = 20;
export const DEFAULT_QUESTION_COUNT = 12;

/** Every MCQ has exactly four options, so "one correct of four" is uniform. */
export const OPTIONS_PER_QUESTION = 4;

/** The instruction embedded to retrieve chunks to build questions from. */
export const QUIZ_QUERY =
  "important facts, definitions, processes and distinctions a student should be tested on";

export interface QuestionDraft {
  stem: string;
  options: string[];
  correctOption: number;
  difficulty: Difficulty;
  chunkId: ObjectId;
}

let client: OpenAI | undefined;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set — add it to .env.local");
  return (client ??= new OpenAI({ apiKey }));
}

/**
 * Difficulty is expressed to the model as Bloom's-taxonomy level and distractor
 * quality, which is how spec §7 defines it — not as a vague "make it harder".
 */
export const DIFFICULTY_BRIEF: Record<Difficulty, string> = {
  easy: "Recall level. Ask for a fact stated plainly in the excerpt. Distractors are clearly wrong to anyone who read it.",
  medium:
    "Comprehension level. Ask the student to explain or classify something from the excerpt. Distractors are plausible but refutable from the excerpt.",
  hard: "Application or analysis level. Ask the student to apply a principle, compare two ideas, or infer a consequence. Distractors are near-misses — common misconceptions, or true statements that don't answer the question.",
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stem: { type: "string", description: "The question. Self-contained." },
          options: {
            type: "array",
            description: `Exactly ${OPTIONS_PER_QUESTION} answer options.`,
            items: { type: "string" },
          },
          correctIndex: {
            type: "integer",
            description: "0-based index of the correct option.",
          },
          source: {
            type: "integer",
            description: "Number of the excerpt this question is answerable from.",
          },
        },
        required: ["stem", "options", "correctIndex", "source"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

function systemPrompt(count: number, difficulty: Difficulty): string {
  return `You write multiple-choice questions from course material.

Rules:
- Use ONLY the numbered excerpts provided. Every question must be answerable from its excerpt alone.
- Never ask about anything the excerpts don't state. No outside knowledge.
- Write exactly ${count} questions, spread across the excerpts rather than clustered on one.
- Each question has exactly ${OPTIONS_PER_QUESTION} options, exactly one correct.
- Options must be mutually exclusive and similar in length and style, so the answer isn't guessable from formatting.
- Never use "all of the above" or "none of the above".
- Set "source" to the number of the excerpt the question came from.
- Difficulty: ${DIFFICULTY_BRIEF[difficulty]}`;
}

/**
 * Generates grounded MCQs from retrieved chunks.
 *
 * As with summaries, the model returns an excerpt *number* rather than a chunk
 * id, so every question's citation is resolved here against chunks we actually
 * supplied — a question can't cite a source that doesn't exist (spec §9).
 * Anything malformed is dropped rather than repaired, because a silently
 * "fixed" question could have the wrong answer marked correct.
 */
export async function generateQuestions(
  retrieved: ScoredChunk[],
  count: number = DEFAULT_QUESTION_COUNT,
  difficulty: Difficulty = "medium",
): Promise<QuestionDraft[]> {
  if (retrieved.length === 0) return [];

  const excerpts = retrieved
    .map(({ chunk }, i) => `[${i + 1}] (page ${chunk.sourcePage})\n${chunk.text}`)
    .join("\n\n");

  const response = await getClient().chat.completions.create({
    model: GENERATION_MODEL,
    // A little variety across distractors, still anchored to the excerpts.
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt(count, difficulty) },
      { role: "user", content: `Excerpts:\n\n${excerpts}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "mcq_set", strict: true, schema: RESPONSE_SCHEMA },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("The model returned no questions.");

  const parsed = JSON.parse(content) as {
    questions: { stem: string; options: string[]; correctIndex: number; source: number }[];
  };

  const seen = new Set<string>();

  return parsed.questions.flatMap<QuestionDraft>(({ stem, options, correctIndex, source }) => {
    const cited = retrieved[source - 1];
    const cleanStem = stem?.trim();
    const cleanOptions = options?.map((option) => option.trim()).filter(Boolean) ?? [];

    // Each guard covers a way a question would be unusable or unfair:
    if (!cited) return []; // citation we never supplied
    if (!cleanStem) return []; // no question
    if (cleanOptions.length !== OPTIONS_PER_QUESTION) return []; // wrong option count
    if (!Number.isInteger(correctIndex)) return [];
    if (correctIndex < 0 || correctIndex >= cleanOptions.length) return []; // answer out of range
    if (new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length) return []; // duplicate options: two "correct" answers

    // Near-identical stems make a quiz feel broken; keep the first.
    const key = cleanStem.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return [];
    seen.add(key);

    return [
      {
        stem: cleanStem,
        options: cleanOptions,
        correctOption: correctIndex,
        difficulty,
        chunkId: cited.chunk._id,
      },
    ];
  });
}
