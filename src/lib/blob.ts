/**
 * Upload constraints, shared by the token endpoint, the upload form and the
 * `check:blob` probe so they cannot drift apart.
 *
 * Constants only — this is imported by a client component.
 */

/** Spec §9: max 50 MB per upload. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Must match how the Blob store itself is configured, or every upload fails
 * with "Cannot use public access on a private store" *after* a token has
 * already been issued. `check:blob` verifies this against the real store.
 *
 * Private also means an uploaded PDF is not readable by URL alone (403 without
 * a token), which is what spec §9's isolation rule wants.
 */
export const BLOB_ACCESS = "private" as const;
