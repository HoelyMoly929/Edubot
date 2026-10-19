import { ObjectId } from "mongodb";
import { documents, questions as questionsCollection, quizzes } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { retrieveChunks } from "@/lib/retrieve";
import {
  DEFAULT_QUESTION_COUNT,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  QUIZ_QUERY,
  generateQuizPool,
} from "@/lib/quiz";
import type { PdfDocument, Question, Quiz } from "@/lib/schema";

// Model calls (and for processing, extracting and embedding a large PDF) can
// outlast the platform default. 300s is the ceiling on Vercel's free tier.
export const maxDuration = 300;

async function authorise(idParam: string): Promise<PdfDocument | Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!ObjectId.isValid(idParam)) {
    return Response.json({ error: "Invalid document id" }, { status: 400 });
  }

  // Scoped to the caller, so another user's document is simply not found.
  const doc = await (await documents()).findOne({
    _id: new ObjectId(idParam),
    userId: user._id,
  });
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });

  return doc;
}

/** Lists the quizzes generated for a document, newest first. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const doc = await authorise((await params).id);
  if (doc instanceof Response) return doc;

  const found = await (await quizzes())
    .find({ documentId: doc._id })
    .sort({ createdAt: -1 })
    .toArray();

  return Response.json({ quizzes: found });
}

/**
 * Generates a grounded quiz: retrieve the most relevant chunks, then build
 * questions from only those excerpts (spec §6). Every quiz starts at medium
 * difficulty; the adaptive engine moves from there during an attempt (spec §7).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const doc = await authorise((await params).id);
  if (doc instanceof Response) return doc;

  if (doc.status !== "ready") {
    return Response.json(
      { error: "That document hasn't finished processing yet." },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const requested = Number.isInteger(body?.count) ? body.count : DEFAULT_QUESTION_COUNT;
  const count = Math.min(Math.max(requested, MIN_QUESTIONS), MAX_QUESTIONS);
  const topK = Number.isInteger(body?.topK) ? Math.min(Math.max(body.topK, 1), 20) : undefined;

  try {
    const retrieved = await retrieveChunks(doc._id, QUIZ_QUERY, topK);
    if (retrieved.length === 0) {
      return Response.json({ error: "That document has no indexed text." }, { status: 409 });
    }

    // Pool spans easy/medium/hard so the adaptive engine has somewhere to move;
    // the attempt itself still starts at medium (spec §7).
    const drafts = await generateQuizPool(retrieved, count);

    // Dropping malformed questions can leave too few to be a quiz at all.
    if (drafts.length < MIN_QUESTIONS) {
      return Response.json(
        {
          error:
            `Only ${drafts.length} usable questions could be grounded in this material ` +
            `(${MIN_QUESTIONS} needed). Try a document with more detail.`,
        },
        { status: 422 },
      );
    }

    // Numbered per document, so the first is "Quiz 1". Rename any time.
    const existing = await (await quizzes()).countDocuments({ documentId: doc._id });
    const quiz: Omit<Quiz, "_id"> = {
      documentId: doc._id,
      name: `Quiz ${existing + 1}`,
      questionCount: drafts.length,
      createdAt: new Date(),
    };
    const { insertedId: quizId } = await (await quizzes()).insertOne(quiz as Quiz);

    await (await questionsCollection()).insertMany(
      drafts.map<Omit<Question, "_id">>((draft) => ({ quizId, ...draft })) as Question[],
    );

    return Response.json(
      { quiz: { ...quiz, _id: quizId }, questionCount: drafts.length },
      { status: 201 },
    );
  } catch (err) {
    console.error("quiz generation failed", err);
    return Response.json(
      { error: "Could not generate a quiz right now. Please try again." },
      { status: 502 },
    );
  }
}
