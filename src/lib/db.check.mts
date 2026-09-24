/**
 * Live check against the real database. Run: `npm run check:db`
 *
 * Connects with the app's own getDb(), which applies the indexes and validators,
 * then verifies they actually landed. Safe to re-run — it only reads and creates
 * the (empty) collections, never writes documents.
 */
import assert from "node:assert/strict";
// @next/env is CommonJS, so it has no named exports under ESM.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { getDb } = await import("./db.ts");
const { COLLECTIONS, SETUP } = await import("./schema.ts");

const db = await getDb();
console.log(`connected → database "${db.databaseName}"`);

const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

for (const name of Object.values(COLLECTIONS)) {
  assert.ok(existing.has(name), `collection "${name}" was not created`);

  const indexes = await db.collection(name).indexes();
  // _id_ is implicit, so every configured index should be additional to it.
  assert.equal(
    indexes.length,
    SETUP[name].indexes.length + 1,
    `${name}: expected ${SETUP[name].indexes.length} index(es) plus _id_, found ${indexes.length}`,
  );

  // nameOnly: false narrows the result to full CollectionInfo (with `options`).
  const [{ options }] = await db.listCollections({ name }, { nameOnly: false }).toArray();
  assert.ok(options?.validator?.$jsonSchema, `${name}: validator not attached`);
  assert.deepEqual(
    options.validator.$jsonSchema.required,
    SETUP[name].required,
    `${name}: validator required-fields drifted`,
  );

  console.log(
    `  ${name.padEnd(13)} ${indexes.length - 1} index(es), validator requires [${SETUP[name].required.join(", ")}]`,
  );
}

console.log(`OK — all ${Object.keys(COLLECTIONS).length} collections present and configured`);
process.exit(0);
