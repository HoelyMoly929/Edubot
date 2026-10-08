import { ObjectId } from "mongodb";
import { documents, questions, quizAttempts, quizzes } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { STARTING_DIFFICULTY, selectNextQuestion } from "@/lib/adaptive";
import type { QuizAttempt } from "@/lib/schema";

/**
 * Starts an attempt at a quiz and hands back the first question.
 *
 * Spec §7: every attempt begins at medium difficulty, regardless of how the
 * student did on previous attempts.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid quiz id" }, { status: 400 });
  }

  const quiz = await (await quizzes()).findOne({ _id: new ObjectId(id) });
  if (!quiz) return Response.json({ error: "Not found" }, { status: 404 });

  // A quiz has no owner of its own — it inherits one from its document, so
  // ownership is checked there (spec §9).
  const owned = await (await documents()).findOne({
    _id: quiz.documentId,
    userId: user._id,
  });
  if (!owned) return Response.json({ error: "Not found" }, { status: 404 });

  const pool = await (await questions()).find({ quizId: quiz._id }).toArray();
  const first = selectNextQuestion(pool, new Set(), STARTING_DIFFICULTY);
  if (!first) {
    return Response.json({ error: "That quiz has no questions." }, { status: 409 });
  }

  const attempt: Omit<QuizAttempt, "_id"> = {
    userId: user._id,
    quizId: quiz._id,
    responses: [],
    score: 0,
    finalDifficulty: STARTING_DIFFICULTY,
    startedAt: new Date(),
  };
  const { insertedId } = await (await quizAttempts()).insertOne(attempt as QuizAttempt);

  return Response.json(
    {
      attemptId: insertedId,
      difficulty: STARTING_DIFFICULTY,
      remaining: pool.length,
      // Never ship correctOption to the client before it's answered.
      question: {
        _id: first._id,
        stem: first.stem,
        options: first.options,
        difficulty: first.difficulty,
      },
    },
    { status: 201 },
  );
}
