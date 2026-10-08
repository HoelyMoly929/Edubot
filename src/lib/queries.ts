import { ObjectId } from "mongodb";
import {
  chunks,
  documents,
  questions,
  quizAttempts,
  quizzes,
  summaries,
} from "./db.ts";
import { getCurrentUser } from "./user.ts";
import type { PdfDocument, Quiz, QuizAttempt, Summary } from "./schema.ts";

/**
 * Read helpers for server components.
 *
 * Every query here filters by the signed-in user. Pages import these rather
 * than hand-rolling a find(), so there is one place where the auth token
 * becomes a database filter (spec §9) instead of one per page.
 */

export async function listDocuments(): Promise<PdfDocument[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return (await documents())
    .find({ userId: user._id })
    .sort({ uploadedAt: -1 })
    .toArray();
}

/** Returns null for a document that doesn't exist *or* isn't the caller's. */
export async function getDocument(id: string): Promise<PdfDocument | null> {
  const user = await getCurrentUser();
  if (!user || !ObjectId.isValid(id)) return null;
  return (await documents()).findOne({ _id: new ObjectId(id), userId: user._id });
}

export async function getLatestSummary(documentId: ObjectId): Promise<Summary | null> {
  return (await summaries()).findOne({ documentId }, { sort: { createdAt: -1 } });
}

export interface CitedPoint {
  text: string;
  chunkId: string;
  sourcePage: number;
  endPage?: number;
  /** The excerpt this point was generated from, for verifying it (spec §9). */
  sourceText: string;
}

/**
 * The latest summary with each point's source excerpt attached.
 *
 * Joined here rather than fetched on click: it's one extra query against an
 * indexed field, and it means verifying a citation is instant instead of a
 * spinner — which is the difference between people checking sources and not.
 */
export async function getSummaryWithSources(documentId: ObjectId): Promise<{
  points: CitedPoint[];
  createdAt: Date;
} | null> {
  const summary = await getLatestSummary(documentId);
  if (!summary) return null;

  const sources = await (await chunks())
    .find({ _id: { $in: summary.points.map((point) => point.chunkId) } })
    .toArray();
  const byId = new Map(sources.map((chunk) => [chunk._id.toString(), chunk]));

  return {
    createdAt: summary.createdAt,
    points: summary.points.map((point) => ({
      text: point.text,
      chunkId: point.chunkId.toString(),
      sourcePage: point.sourcePage,
      // Prefer the chunk's own range; stored points predate the field.
      endPage: byId.get(point.chunkId.toString())?.endPage ?? point.endPage,
      sourceText: byId.get(point.chunkId.toString())?.text ?? "",
    })),
  };
}

export async function listQuizzes(documentId: ObjectId): Promise<Quiz[]> {
  return (await quizzes()).find({ documentId }).sort({ createdAt: -1 }).toArray();
}

/** An attempt plus the questions it draws on, or null if it isn't the caller's. */
export async function getAttempt(id: string): Promise<{
  attempt: QuizAttempt;
  quiz: Quiz;
  document: PdfDocument;
} | null> {
  const user = await getCurrentUser();
  if (!user || !ObjectId.isValid(id)) return null;

  const attempt = await (await quizAttempts()).findOne({
    _id: new ObjectId(id),
    userId: user._id,
  });
  if (!attempt) return null;

  const quiz = await (await quizzes()).findOne({ _id: attempt.quizId });
  if (!quiz) return null;

  const document = await (await documents()).findOne({ _id: quiz.documentId });
  if (!document) return null;

  return { attempt, quiz, document };
}

export interface AttemptSummary {
  attempt: QuizAttempt;
  documentName: string;
  total: number;
}

/** Past attempts, newest first, for the history page (spec §8). */
export async function listAttempts(): Promise<AttemptSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const attempts = await (await quizAttempts())
    .find({ userId: user._id })
    .sort({ startedAt: -1 })
    .limit(50)
    .toArray();
  if (attempts.length === 0) return [];

  // Resolve quiz → document names in two queries rather than one per attempt.
  const quizDocs = await (await quizzes())
    .find({ _id: { $in: attempts.map((a) => a.quizId) } })
    .toArray();
  const quizById = new Map(quizDocs.map((quiz) => [quiz._id.toString(), quiz]));

  const docs = await (await documents())
    .find({ _id: { $in: quizDocs.map((quiz) => quiz.documentId) }, userId: user._id })
    .toArray();
  const docById = new Map(docs.map((doc) => [doc._id.toString(), doc]));

  return attempts.map((attempt) => {
    const quiz = quizById.get(attempt.quizId.toString());
    const doc = quiz ? docById.get(quiz.documentId.toString()) : undefined;
    return {
      attempt,
      // A quiz cleared by re-indexing still leaves its attempt (spec §8).
      documentName: doc?.filename ?? "Removed document",
      total: quiz?.questionCount ?? attempt.responses.length,
    };
  });
}

/** Questions for an attempt, without leaking which option is correct. */
export async function getAttemptQuestions(quizId: ObjectId) {
  return (await questions())
    .find({ quizId }, { projection: { correctOption: 0 } })
    .toArray();
}
