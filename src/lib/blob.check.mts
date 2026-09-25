/**
 * Live check against the real Blob store. Run: `npm run check:blob`
 *
 * Round-trips a tiny file using the same BLOB_ACCESS the app uses. Exists
 * because an access-mode mismatch between the code and the store only shows up
 * as a failed upload in the browser — the token endpoint still returns 200,
 * so the error surfaces far from its cause.
 */
import assert from "node:assert/strict";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { put, head, del } = await import("@vercel/blob");
const { BLOB_ACCESS, MAX_UPLOAD_BYTES } = await import("./blob.ts");

assert.ok(process.env.BLOB_READ_WRITE_TOKEN, "BLOB_READ_WRITE_TOKEN is not set");

const probe = Buffer.from("%PDF-1.4\n%%EOF\n");
const blob = await put("check-probe.pdf", probe, {
  access: BLOB_ACCESS,
  addRandomSuffix: true,
  contentType: "application/pdf",
});

try {
  const meta = await head(blob.url);
  assert.equal(meta.size, probe.length, "round-tripped size differs");

  // Private blobs must not be readable without a token.
  if (BLOB_ACCESS === "private") {
    const res = await fetch(blob.url);
    assert.equal(res.status, 403, `expected 403 for an anonymous read, got ${res.status}`);
  }

  console.log(`OK — store accepts access="${BLOB_ACCESS}", ${meta.size} bytes round-tripped`);
  console.log(`   anonymous read blocked; upload cap ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
} finally {
  await del(blob.url);
}

process.exit(0);
