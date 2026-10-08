/**
 * Self-check for quiz constants and difficulty briefs. Run: `npm run check:quiz`
 *
 * The response-validation guards in generateQuestions are exercised against the
 * live model by the end-to-end test; this covers the parts that are pure.
 */
import assert from "node:assert/strict";
import {
  DEFAULT_QUESTION_COUNT,
  DIFFICULTY_BRIEF,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  OPTIONS_PER_QUESTION,
  QUIZ_QUERY,
} from "./quiz.ts";
import { DIFFICULTIES } from "./schema.ts";

// Spec §2: 10–20 questions per quiz.
assert.equal(MIN_QUESTIONS, 10, "spec §2 requires a minimum of 10 questions");
assert.equal(MAX_QUESTIONS, 20, "spec §2 requires a maximum of 20 questions");
assert.ok(
  DEFAULT_QUESTION_COUNT >= MIN_QUESTIONS && DEFAULT_QUESTION_COUNT <= MAX_QUESTIONS,
  "the default question count must sit inside the spec's range",
);
assert.ok(OPTIONS_PER_QUESTION >= 3, "an MCQ needs enough options to be non-trivial");
assert.ok(QUIZ_QUERY.trim().length > 0, "retrieval query must not be empty");

// Every difficulty the adaptive engine can select must have a brief to send the
// model, or step 8 could request a level that generates nothing useful.
assert.deepEqual(
  Object.keys(DIFFICULTY_BRIEF).sort(),
  [...DIFFICULTIES].sort(),
  "every Difficulty level needs a prompt brief — step 8 can request any of them",
);
for (const level of DIFFICULTIES) {
  assert.ok(DIFFICULTY_BRIEF[level].trim().length > 20, `${level} brief is too thin to steer the model`);
}
// The briefs must actually differ, or "adaptive" difficulty changes nothing.
assert.equal(
  new Set(Object.values(DIFFICULTY_BRIEF)).size,
  DIFFICULTIES.length,
  "difficulty briefs must be distinct",
);

console.log(
  `OK — quiz config matches spec §2 (${MIN_QUESTIONS}–${MAX_QUESTIONS} questions, ` +
    `${OPTIONS_PER_QUESTION} options, briefs for ${DIFFICULTIES.join("/")})`,
);
