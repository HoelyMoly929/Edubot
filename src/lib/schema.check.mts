/**
 * Self-check for the collection setup config. Run: `npm run check:schema`
 *
 * Guards the mistake this config invites: adding a collection or a required
 * field and forgetting to wire up its indexes/validator. Node runs this file
 * directly via type stripping — schema.ts is type-only imports, so no driver
 * or DB connection is involved.
 */
import assert from "node:assert/strict";
import { COLLECTIONS, DIFFICULTIES, SETUP } from "./schema.ts";

const names = Object.values(COLLECTIONS);

assert.equal(new Set(names).size, names.length, "duplicate collection name");

assert.deepEqual(
  [...names].sort(),
  Object.keys(SETUP).sort(),
  "COLLECTIONS and SETUP disagree — a collection is missing its index/validator config",
);

for (const [name, { indexes, required, properties }] of Object.entries(SETUP)) {
  assert.ok(indexes.length > 0, `${name}: no indexes — every lookup path should be indexed`);
  assert.ok(required.length > 0, `${name}: validator requires nothing`);

  for (const field of required) {
    assert.ok(
      field in properties,
      `${name}: "${field}" is required but has no declared bsonType`,
    );
  }
}

// Ownership keys must be non-optional, or row-level isolation (spec §9) can be
// bypassed by inserting a document with no owner.
for (const [name, field] of [
  ["documents", "userId"],
  ["chunks", "documentId"],
  ["summaries", "documentId"],
  ["quizzes", "documentId"],
  ["questions", "quizId"],
  ["quizAttempts", "userId"],
] as const) {
  assert.ok(
    SETUP[name].required.includes(field),
    `${name}: "${field}" must be required — it is the isolation key`,
  );
}

// Difficulty enums must track the Difficulty union, not drift from it.
for (const [name, field] of [
  ["questions", "difficulty"],
  ["quizAttempts", "finalDifficulty"],
] as const) {
  assert.deepEqual(
    (SETUP[name].properties as Record<string, { enum?: string[] }>)[field].enum,
    DIFFICULTIES,
    `${name}.${field}: enum out of sync with Difficulty`,
  );
}

console.log(`OK — ${names.length} collections, config consistent`);
