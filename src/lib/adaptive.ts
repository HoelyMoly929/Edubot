import { DIFFICULTIES, type Difficulty, type Question, type QuizAttempt } from "./schema.ts";

/**
 * Adaptive difficulty engine (spec §7).
 *
 * Target band is 70–85% correct: above it the material is too easy, below it
 * the student is floundering. Inside the band, difficulty holds.
 */
export const TARGET_LOWER = 0.7;
export const TARGET_UPPER = 0.85;

/**
 * How many recent answers the difficulty decision looks at. A whole-attempt
 * average stops moving once enough questions are banked, which would make the
 * quiz stop adapting halfway through — "rolling" is the point.
 */
export const ROLLING_WINDOW = 5;

export const STARTING_DIFFICULTY: Difficulty = "medium";

type Response = Pick<QuizAttempt["responses"][number], "correct">;

/** Proportion correct over the whole attempt — the score shown to the student. */
export function overallScore(responses: readonly Response[]): number {
  if (responses.length === 0) return 0;
  return responses.filter((response) => response.correct).length / responses.length;
}

/** Proportion correct over the last `window` answers, which drives adaptation. */
export function rollingScore(
  responses: readonly Response[],
  window: number = ROLLING_WINDOW,
): number {
  if (responses.length === 0) return 0;
  return overallScore(responses.slice(-window));
}

/**
 * Picks the difficulty for the next question.
 *
 * Moves one level at a time: jumping easy → hard on a single good streak would
 * overshoot the band it is trying to settle inside.
 */
export function adjustDifficulty(current: Difficulty, rolling: number): Difficulty {
  const index = DIFFICULTIES.indexOf(current);

  if (rolling > TARGET_UPPER) {
    return DIFFICULTIES[Math.min(index + 1, DIFFICULTIES.length - 1)];
  }
  if (rolling < TARGET_LOWER) {
    return DIFFICULTIES[Math.max(index - 1, 0)];
  }
  return current; // inside the band — hold
}

/**
 * Chooses the next unanswered question, preferring the target difficulty and
 * falling back to the nearest available level.
 *
 * Without the fallback an attempt would dead-end as soon as one difficulty ran
 * out, even with questions left to ask.
 */
export function selectNextQuestion(
  questions: readonly Question[],
  answeredIds: ReadonlySet<string>,
  difficulty: Difficulty,
): Question | null {
  const remaining = questions.filter((question) => !answeredIds.has(question._id.toString()));
  if (remaining.length === 0) return null;

  const target = DIFFICULTIES.indexOf(difficulty);
  return remaining.reduce((best, question) => {
    const distance = Math.abs(DIFFICULTIES.indexOf(question.difficulty) - target);
    const bestDistance = Math.abs(DIFFICULTIES.indexOf(best.difficulty) - target);
    return distance < bestDistance ? question : best;
  });
}
