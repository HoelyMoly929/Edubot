import { ObjectId } from "mongodb";
import { chunks, questions, quizAttempts } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { adjustDifficulty, overallScore, rollingScore, selectNextQuestion } from "@/lib/adaptive";

/**
 * Records one answer and adapts difficulty in real time (spec §7).
 *
 * Marking happens here, never on the client: the correct option is not sent to
 * the browser until the question has been answered.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid attempt id" }, { status: 400 });
  }

  const attemptsCol = await quizAttempts();
  // Scoped to the caller, so one user can't answer into another's attempt.
  const attempt = await attemptsCol.findOne({ _id: new ObjectId(id), userId: user._id });
  if (!attempt) return Response.json({ error: "Not found" }, { status: 404 });
  if (attempt.completedAt) {
    return Response.json({ error: "That attempt is already finished." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const { questionId, selectedOption } = body ?? {};
  if (typeof questionId !== "string" || !ObjectId.isValid(questionId)) {
    return Response.json({ error: "questionId is required" }, { status: 400 });
  }
  if (!Number.isInteger(selectedOption)) {
    return Response.json({ error: "selectedOption must be an integer" }, { status: 400 });
  }

  const questionsCol = await questions();
  const question = await questionsCol.findOne({
    _id: new ObjectId(questionId),
    quizId: attempt.quizId, // must belong to the quiz being attempted
  });
  if (!question) return Response.json({ error: "No such question" }, { status: 404 });

  if (attempt.responses.some((response) => response.questionId.equals(question._id))) {
    return Response.json({ error: "That question is already answered." }, { status: 409 });
  }
  if (selectedOption < 0 || selectedOption >= question.options.length) {
    return Response.json({ error: "selectedOption is out of range" }, { status: 400 });
  }

  const correct = selectedOption === question.correctOption;
  const responses = [
    ...attempt.responses,
    { questionId: question._id, selectedOption, correct, answeredAt: new Date() },
  ];

  // Rolling window drives adaptation; the overall ratio is the reported score.
  const nextDifficulty = adjustDifficulty(attempt.finalDifficulty, rollingScore(responses));
  const score = overallScore(responses);

  const pool = await questionsCol.find({ quizId: attempt.quizId }).toArray();
  const answeredIds = new Set(responses.map((response) => response.questionId.toString()));
  const next = selectNextQuestion(pool, answeredIds, nextDifficulty);

  await attemptsCol.updateOne(
    { _id: attempt._id, userId: user._id },
    {
      $set: {
        responses,
        score,
        // Spec §7: the level reached is recorded on the attempt.
        finalDifficulty: nextDifficulty,
        ...(next ? {} : { completedAt: new Date() }),
      },
    },
  );

  // Citation for the answered question, so the student can verify it (spec §9).
  const source = await (await chunks()).findOne({ _id: question.chunkId });

  return Response.json({
    correct,
    correctOption: question.correctOption,
    citation: source
      ? {
          chunkId: source._id,
          sourcePage: source.sourcePage,
          endPage: source.endPage,
          text: source.text,
        }
      : null,
    score,
    difficulty: nextDifficulty,
    difficultyChanged: nextDifficulty !== attempt.finalDifficulty,
    answered: responses.length,
    remaining: pool.length - responses.length,
    question: next
      ? {
          _id: next._id,
          stem: next.stem,
          options: next.options,
          difficulty: next.difficulty,
        }
      : null,
    completed: !next,
  });
}
