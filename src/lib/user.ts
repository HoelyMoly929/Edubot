import { auth, currentUser } from "@clerk/nextjs/server";
import { users } from "./db.ts";
import type { User } from "./schema.ts";

/**
 * Resolves the Clerk session to this app's own User record, creating it on first
 * sign-in. Returns null when signed out.
 *
 * Every user-scoped query keys off the returned `_id` — this is the single point
 * where the auth token becomes a database filter (spec §9).
 */
export async function getCurrentUser(): Promise<User | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const col = await users();
  const existing = await col.findOne({ clerkId });
  if (existing) return existing;

  // First sign-in. upsert rather than insert so two concurrent requests can't
  // trip the unique index on clerkId.
  const clerk = await currentUser();
  return col.findOneAndUpdate(
    { clerkId },
    {
      $setOnInsert: {
        clerkId,
        email: clerk?.primaryEmailAddress?.emailAddress ?? "",
        createdAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
}
