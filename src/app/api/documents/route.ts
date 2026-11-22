import { head } from "@vercel/blob";
import { after } from "next/server";
import { blobToken } from "@/lib/blob-token";
import { documents } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { processDocument } from "@/lib/process";
import type { PdfDocument } from "@/lib/schema";

// The background read below runs inside this limit (extract + embed a large PDF).
export const maxDuration = 300;

/** Lists the caller's own documents, newest first. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const col = await documents();
  const docs = await col
    .find({ userId: user._id }) // scoped to the caller — never a bare find()
    .sort({ uploadedAt: -1 })
    .toArray();

  return Response.json({ documents: docs });
}

/**
 * Records a finished upload. The browser sends the blob URL it just wrote; we
 * confirm that blob really exists in our store before trusting it.
 *
 * Reading the PDF (extract, chunk, embed) starts here in the background, so the
 * user can leave the moment the file is saved and the document still finishes.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { url, filename } = (await request.json()) as {
    url?: unknown;
    filename?: unknown;
  };

  if (typeof url !== "string" || typeof filename !== "string" || !filename) {
    return Response.json({ error: "url and filename are required" }, { status: 400 });
  }

  // A client can post any string here, so verify against Blob rather than
  // storing an unchecked URL.
  let size: number;
  try {
    ({ size } = await head(url, { token: blobToken() }));
  } catch {
    return Response.json({ error: "No such upload" }, { status: 400 });
  }

  const doc: Omit<PdfDocument, "_id"> = {
    userId: user._id,
    filename,
    blobUrl: url,
    uploadedAt: new Date(),
    // Text extraction (step 5) flips this to "ready" and fills in pageCount.
    status: "processing",
  };

  const col = await documents();
  const { insertedId } = await col.insertOne(doc as PdfDocument);

  after(() => processDocument({ ...doc, _id: insertedId } as PdfDocument));

  return Response.json({ document: { ...doc, _id: insertedId, size } }, { status: 201 });
}
