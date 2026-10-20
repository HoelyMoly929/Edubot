/**
 * The Blob read-write token, cleaned of the wrapping a copy-paste leaves.
 *
 * Next's env loader strips quotes from `.env.local`, but Vercel stores a
 * dashboard value byte for byte. A token pasted as "vercel_blob_rw_…" still
 * parses to the right store, but its secret ends in a stray quote, so every
 * signed upload fails with "Access denied, please provide a valid token". It
 * worked locally and broke only when deployed.
 *
 * Every server-side Blob call passes this explicitly rather than letting the
 * SDK read the raw variable. Server only: it reads a secret.
 */
export function blobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  return token;
}
