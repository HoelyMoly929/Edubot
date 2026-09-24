import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/user";

/** Spec §9: max 50 MB per upload. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Issues a short-lived token so the browser can upload straight to Vercel Blob.
 *
 * The file never passes through this function on purpose: a Vercel function's
 * request body caps out around 4.5 MB, well under the 50 MB the spec allows.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Runs before any bytes move — an unauthenticated caller gets no token.
        const user = await getCurrentUser();
        if (!user) throw new Error("Unauthorized");

        // Keep the store flat and predictable; the random suffix handles collisions.
        if (pathname.includes("/")) throw new Error("Invalid filename");
        if (!pathname.toLowerCase().endsWith(".pdf")) {
          throw new Error("Only PDF files are accepted");
        }

        return {
          // Enforced by Blob itself, so a client that lies about size still fails.
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user._id.toString() }),
        };
      },
      // Deliberately no onUploadCompleted: Vercel calls it as a webhook, which
      // cannot reach localhost. The browser finalises via POST /api/documents.
    });

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: message === "Unauthorized" ? 401 : 400 });
  }
}
