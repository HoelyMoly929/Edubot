import { ObjectId } from "mongodb";
import { documents, quizzes } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { MAX_QUIZ_NAME, cleanQuizName } from "@/lib/quiz-name";

/** Renames a quiz the caller owns. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid quiz id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const name = cleanQuizName(body?.name);
  if (!name) {
    return Response.json(
      { error: `A name needs 1–${MAX_QUIZ_NAME} characters.` },
      { status: 400 },
    );
  }

  const quizzesCol = await quizzes();
  const quiz = await quizzesCol.findOne({ _id: new ObjectId(id) });
  if (!quiz) return Response.json({ error: "Not found" }, { status: 404 });

  // A quiz inherits its owner from its document (spec §9).
  const owned = await (await documents()).findOne({ _id: quiz.documentId, userId: user._id });
  if (!owned) return Response.json({ error: "Not found" }, { status: 404 });

  await quizzesCol.updateOne({ _id: quiz._id }, { $set: { name } });
  return Response.json({ name });
}
