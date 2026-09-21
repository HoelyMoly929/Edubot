import type { IndexSpecification, CreateIndexesOptions, Document } from "mongodb";
import type { ObjectId } from "mongodb";

/**
 * The 7 collections from the CP1 proposal's ERD (spec §5).
 *
 * Types here are the single source of truth for document shape. The DB-level
 * validators further down only assert required fields + BSON types — deliberately
 * not a full mirror of these interfaces, so there's nothing to drift.
 */

/** Quiz difficulty levels driving the adaptive engine (spec §7). */
export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** Clerk-linked identity. `clerkId` is the join key to the auth token. */
export interface User {
  _id: ObjectId;
  clerkId: string;
  email: string;
  createdAt: Date;
}

/**
 * One per uploaded PDF.
 *
 * `status` isn't in the ERD's field list — it's required by spec §9's
 * "no blocking UI" rule, which needs a server-side processing state to render
 * "Extracting text…" against.
 */
export interface PdfDocument {
  _id: ObjectId;
  userId: ObjectId;
  filename: string;
  blobUrl: string;
  pageCount: number;
  uploadedAt: Date;
  status: "processing" | "ready" | "failed";
  /** Set when status is "failed" — surfaced to the user per spec §11. */
  error?: string;
}

/**
 * A retrievable slice of a Document (~500 words, 10–15% overlap — spec §6).
 * `position` + `sourcePage` are what make citations traceable.
 */
export interface Chunk {
  _id: ObjectId;
  documentId: ObjectId;
  text: string;
  position: number;
  sourcePage: number;
  /** text-embedding-3-small output: 1536 dimensions. */
  embedding: number[];
}

/** Generated study notes. Every point cites the chunk it came from (spec §9). */
export interface Summary {
  _id: ObjectId;
  documentId: ObjectId;
  points: { text: string; chunkId: ObjectId }[];
  createdAt: Date;
}

export interface Quiz {
  _id: ObjectId;
  documentId: ObjectId;
  /** 10–20 per the proposal. */
  questionCount: number;
  createdAt: Date;
}

/** One MCQ, grounded in exactly one Chunk for traceability. */
export interface Question {
  _id: ObjectId;
  quizId: ObjectId;
  stem: string;
  options: string[];
  /** Index into `options`. */
  correctOption: number;
  difficulty: Difficulty;
  chunkId: ObjectId;
}

/** One full run through a Quiz by one User (spec §7). */
export interface QuizAttempt {
  _id: ObjectId;
  userId: ObjectId;
  quizId: ObjectId;
  responses: {
    questionId: ObjectId;
    selectedOption: number;
    correct: boolean;
    answeredAt: Date;
  }[];
  /** Rolling score, 0–1, recomputed after each answer. */
  score: number;
  /** Difficulty the adaptive engine settled on. */
  finalDifficulty: Difficulty;
  startedAt: Date;
  completedAt?: Date;
}

export const COLLECTIONS = {
  users: "users",
  documents: "documents",
  chunks: "chunks",
  summaries: "summaries",
  quizzes: "quizzes",
  questions: "questions",
  quizAttempts: "quizAttempts",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

type CollectionSetup = {
  indexes: [IndexSpecification, CreateIndexesOptions?][];
  /** Required fields + BSON types only. Keeps ownership keys non-nullable. */
  required: string[];
  properties: Document;
};

const objectId = { bsonType: "objectId" };
const string = { bsonType: "string" };
const int = { bsonType: ["int", "long", "double"] };
const date = { bsonType: "date" };

/**
 * Index + validator config per collection. Applied idempotently by
 * `ensureSetup()` in ./db.
 *
 * Note: the Atlas Vector Search index on `chunks.embedding` is a *search* index,
 * created through Atlas (UI/Admin API) rather than createIndex. Spec §6 defers it
 * until per-document similarity search becomes a latency problem.
 */
export const SETUP: Record<CollectionName, CollectionSetup> = {
  users: {
    indexes: [[{ clerkId: 1 }, { unique: true }]],
    required: ["clerkId", "email", "createdAt"],
    properties: { clerkId: string, email: string, createdAt: date },
  },
  documents: {
    // Dashboard lists a user's own documents, newest first.
    indexes: [[{ userId: 1, uploadedAt: -1 }]],
    required: ["userId", "filename", "blobUrl", "uploadedAt", "status"],
    properties: {
      userId: objectId,
      filename: string,
      blobUrl: string,
      pageCount: int,
      uploadedAt: date,
      status: { enum: ["processing", "ready", "failed"] },
    },
  },
  chunks: {
    // Retrieval and citation display both read a document's chunks in order.
    indexes: [[{ documentId: 1, position: 1 }]],
    required: ["documentId", "text", "position", "embedding"],
    properties: {
      documentId: objectId,
      text: string,
      position: int,
      sourcePage: int,
      embedding: { bsonType: "array", items: { bsonType: "double" } },
    },
  },
  summaries: {
    indexes: [[{ documentId: 1, createdAt: -1 }]],
    required: ["documentId", "points", "createdAt"],
    properties: { documentId: objectId, points: { bsonType: "array" }, createdAt: date },
  },
  quizzes: {
    indexes: [[{ documentId: 1, createdAt: -1 }]],
    required: ["documentId", "questionCount", "createdAt"],
    properties: { documentId: objectId, questionCount: int, createdAt: date },
  },
  questions: {
    indexes: [[{ quizId: 1 }]],
    required: ["quizId", "stem", "options", "correctOption", "difficulty", "chunkId"],
    properties: {
      quizId: objectId,
      stem: string,
      options: { bsonType: "array", items: { bsonType: "string" } },
      correctOption: int,
      difficulty: { enum: DIFFICULTIES },
      chunkId: objectId,
    },
  },
  quizAttempts: {
    // Quiz history, newest first.
    indexes: [[{ userId: 1, startedAt: -1 }], [{ quizId: 1 }]],
    required: ["userId", "quizId", "responses", "score", "finalDifficulty", "startedAt"],
    properties: {
      userId: objectId,
      quizId: objectId,
      responses: { bsonType: "array" },
      score: { bsonType: ["int", "long", "double"] },
      finalDifficulty: { enum: DIFFICULTIES },
      startedAt: date,
    },
  },
};
