/**
 * Quiz name rules, shared by the API and the rename field so they agree.
 * Plain data only — this is imported by a client component.
 */
export const MAX_QUIZ_NAME = 60;

/** Collapses whitespace and returns null if nothing usable is left. */
export function cleanQuizName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_QUIZ_NAME) return null;
  return name;
}

/** Shown for any quiz that predates names and was never backfilled. */
export const UNNAMED_QUIZ = "Untitled quiz";
