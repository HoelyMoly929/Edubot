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
  verifyEvidence,
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

// --- evidence quotes -------------------------------------------------------
// The results screen shows these as "from your document", so a quote that is
// not really in the source must never get through.

const source =
  "Affordances: the shape and size of objects\nsuggest how they should be used. Buttons look pressable.";

assert.equal(
  verifyEvidence("the shape and size of objects suggest how they should be used", source),
  "the shape and size of objects suggest how they should be used",
  "a verbatim quote spanning a PDF line break must be accepted",
);
assert.ok(
  verifyEvidence("THE SHAPE AND SIZE of objects", source),
  "case differences from extraction are tolerated",
);
assert.ok(
  verifyEvidence("\u201cButtons look pressable.\u201d", source),
  "surrounding curly quotes are stripped before matching",
);
assert.equal(
  verifyEvidence("the form and size of objects suggest how they should be used", source),
  undefined,
  "a paraphrase must be rejected — it isn't what the document says",
);
assert.equal(
  verifyEvidence("objects should always be designed to be pressable", source),
  undefined,
  "an invented sentence must be rejected",
);
assert.equal(verifyEvidence("Buttons", source), undefined, "too short to locate anything");
assert.equal(verifyEvidence("", source), undefined);
assert.equal(verifyEvidence(undefined, source), undefined);

console.log(
  `OK — quiz config matches spec §2 (${MIN_QUESTIONS}–${MAX_QUESTIONS} questions, ` +
    `${OPTIONS_PER_QUESTION} options, briefs for ${DIFFICULTIES.join("/")})`,
);
