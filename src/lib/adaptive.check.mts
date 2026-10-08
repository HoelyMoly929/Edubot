/**
 * Self-check for the adaptive difficulty engine. Run: `npm run check:adaptive`
 *
 * Pure logic, no API or DB. This is the mechanism RQ3/O3 is evaluated on, and
 * its failure mode is silent: a quiz that simply never adapts still looks fine.
 */
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
  ROLLING_WINDOW,
  STARTING_DIFFICULTY,
  TARGET_LOWER,
  TARGET_UPPER,
  adjustDifficulty,
  overallScore,
  rollingScore,
  selectNextQuestion,
} from "./adaptive.ts";
import type { Difficulty, Question } from "./schema.ts";

const r = (...results: boolean[]) => results.map((correct) => ({ correct }));

// --- spec §7 constants ----------------------------------------------------

assert.equal(TARGET_LOWER, 0.7, "spec §7 target band starts at 70%");
assert.equal(TARGET_UPPER, 0.85, "spec §7 target band ends at 85%");
assert.equal(STARTING_DIFFICULTY, "medium", "spec §7: every quiz starts at medium");

// --- scoring --------------------------------------------------------------

assert.equal(overallScore([]), 0, "no answers → 0, not NaN");
assert.equal(overallScore(r(true, true, false, false)), 0.5);
assert.equal(rollingScore([]), 0);
// The rolling window must ignore older answers, or adaptation stalls late on.
assert.equal(
  rollingScore(r(false, false, false, false, false, true, true, true, true, true), 5),
  1,
  "rolling score must only consider the most recent window",
);
assert.notEqual(
  rollingScore(r(false, false, false, false, false, true, true, true, true, true), 5),
  overallScore(r(false, false, false, false, false, true, true, true, true, true)),
  "rolling and overall must differ, or the window does nothing",
);

// --- band behaviour -------------------------------------------------------

// Above the band → harder.
assert.equal(adjustDifficulty("medium", 0.9), "hard");
assert.equal(adjustDifficulty("easy", 1.0), "medium");
// Below the band → easier.
assert.equal(adjustDifficulty("medium", 0.4), "easy");
assert.equal(adjustDifficulty("hard", 0.0), "medium");
// Inside the band → hold.
assert.equal(adjustDifficulty("medium", 0.8), "medium", "0.80 is inside the band");

// Boundaries are inclusive: exactly 70% and exactly 85% are *within* the band,
// so neither should move difficulty.
assert.equal(adjustDifficulty("medium", TARGET_LOWER), "medium", "exactly 70% holds");
assert.equal(adjustDifficulty("medium", TARGET_UPPER), "medium", "exactly 85% holds");
// Just outside must move.
assert.equal(adjustDifficulty("medium", TARGET_UPPER + 0.01), "hard");
assert.equal(adjustDifficulty("medium", TARGET_LOWER - 0.01), "easy");

// Clamping at the extremes.
assert.equal(adjustDifficulty("hard", 1.0), "hard", "cannot go beyond hard");
assert.equal(adjustDifficulty("easy", 0.0), "easy", "cannot go below easy");
// One level at a time, never a jump.
assert.notEqual(adjustDifficulty("easy", 1.0), "hard", "must step, not jump");

// --- question selection ---------------------------------------------------

const q = (difficulty: Difficulty): Question => ({
  _id: new ObjectId(),
  quizId: new ObjectId(),
  stem: `${difficulty} question`,
  options: ["a", "b", "c", "d"],
  correctOption: 0,
  difficulty,
  chunkId: new ObjectId(),
});

const easy = q("easy");
const medium = q("medium");
const hard = q("hard");
const pool = [easy, medium, hard];

assert.equal(selectNextQuestion(pool, new Set(), "hard"), hard, "prefers the target difficulty");
assert.equal(selectNextQuestion(pool, new Set(), "easy"), easy);

// Falling back to the nearest level matters: without it an attempt dead-ends
// as soon as one difficulty is exhausted, with questions still unanswered.
assert.equal(
  selectNextQuestion([easy, medium], new Set(), "hard"),
  medium,
  "falls back to the nearest available difficulty",
);
assert.equal(
  selectNextQuestion([easy], new Set(), "hard"),
  easy,
  "falls back across two levels when that is all that remains",
);

// Answered questions are never served twice.
assert.equal(
  selectNextQuestion(pool, new Set([hard._id.toString()]), "hard"),
  medium,
  "skips already-answered questions",
);
assert.equal(
  selectNextQuestion(pool, new Set(pool.map((x) => x._id.toString())), "medium"),
  null,
  "exhausted pool → null, which ends the attempt",
);
assert.equal(selectNextQuestion([], new Set(), "medium"), null);

console.log(
  `OK — adaptive engine matches spec §7 ` +
    `(band ${TARGET_LOWER * 100}–${TARGET_UPPER * 100}%, window ${ROLLING_WINDOW}, start ${STARTING_DIFFICULTY})`,
);
