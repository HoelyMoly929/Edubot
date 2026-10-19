import OpenAI from "openai";
import type { ObjectId } from "mongodb";
import type { ScoredChunk } from "./retrieve.ts";
import { GENERATION_MODEL } from "./summarise.ts";
import { DIFFICULTIES, type Difficulty } from "./schema.ts";

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
  explanation?: string;
  evidence?: string;
}

const squash = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9']+/g, " ")
    .trim();

/**
 * Returns the quote only if it really appears in the source text.
 *
 * The results screen presents this as "from your document", so a paraphrase or
 * an invented line would be a false citation. Comparison ignores case,
 * punctuation and line breaks (PDF extraction mangles those), but not wording.
 */
export function verifyEvidence(quote: string | undefined, source: string): string | undefined {
  const trimmed = quote?.trim().replace(/^["'\u201c]+|["'\u201d]+$/g, "").trim();
  if (!trimmed) return undefined;
  const needle = squash(trimmed);
  // Too short to locate anything; a single word matches everywhere.
  if (needle.split(" ").length < 3) return undefined;
  return squash(source).includes(needle) ? trimmed : undefined;
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

/**
 * Built per call so `source` can only be an excerpt number that exists. Given a
 * label like `[3] (page 21)` the model will otherwise answer with the page
 * number; those questions were correctly dropped as unresolvable, but dropping
 * them silently costs questions. Constrain the value instead.
 */
function responseSchema(excerptCount: number) {
  return {
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
              enum: Array.from({ length: OPTIONS_PER_QUESTION }, (_, i) => i),
            },
            source: {
              type: "integer",
              description: "Number of the excerpt this question is answerable from.",
              enum: Array.from({ length: excerptCount }, (_, i) => i + 1),
            },
            explanation: {
              type: "string",
              description: "One or two plain sentences on why the correct option is right.",
            },
            evidence: {
              type: "string",
              description:
                "A short phrase (5 to 25 words) copied word for word from the source excerpt that contains the answer.",
            },
          },
          required: ["stem", "options", "correctIndex", "source", "explanation", "evidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };
}

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
- "explanation": one or two plain sentences a student can learn from — why the right answer is right, and if a wrong option is tempting, why it is wrong. Don't restate the question.
- "evidence": copy 5 to 25 words EXACTLY as written in the excerpt, where the answer is stated. Do not paraphrase or fix the wording.
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

  // No page number beside the index — that is what the model mistakes for the
  // citation. The page is attached from the chunk afterwards.
  const excerpts = retrieved
    .map(({ chunk }, i) => `[${i + 1}]\n${chunk.text}`)
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
      json_schema: {
        name: "mcq_set",
        strict: true,
        schema: responseSchema(retrieved.length),
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("The model returned no questions.");

  const parsed = JSON.parse(content) as {
    questions: {
      stem: string;
      options: string[];
      correctIndex: number;
      source: number;
      explanation: string;
      evidence: string;
    }[];
  };

  const seen = new Set<string>();

  return parsed.questions.flatMap<QuestionDraft>(
    ({ stem, options, correctIndex, source, explanation, evidence }) => {
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
        explanation: explanation?.trim() || undefined,
        // Dropped rather than shown if it isn't really in the source.
        evidence: verifyEvidence(evidence, cited.chunk.text),
      },
    ];
    },
  );
}

/**
 * Builds the question pool for one quiz, spread across all three difficulties.
 *
 * The adaptive engine (spec §7) can move to any level mid-attempt, so the pool
 * has to already contain questions at every level — generating them on demand
 * would stall the student mid-quiz waiting on the model.
 *
 * One request per difficulty rather than one request asking for a mix: each
 * gets the focused Bloom's-level brief, instead of the model self-labelling
 * difficulty, which it does inconsistently.
 */
export async function generateQuizPool(
  retrieved: ScoredChunk[],
  total: number = DEFAULT_QUESTION_COUNT,
): Promise<QuestionDraft[]> {
  if (retrieved.length === 0) return [];

  // Split as evenly as possible, giving any remainder to the earlier levels.
  const base = Math.floor(total / DIFFICULTIES.length);
  const remainder = total % DIFFICULTIES.length;
  const perLevel = DIFFICULTIES.map((level, i) => ({
    level,
    count: base + (i < remainder ? 1 : 0),
  })).filter(({ count }) => count > 0);

  const batches = await Promise.all(
    perLevel.map(({ level, count }) => generateQuestions(retrieved, count, level)),
  );

  return batches.flat();
}
