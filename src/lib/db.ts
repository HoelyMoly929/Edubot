import { MongoClient, type Db } from "mongodb";
import {
  COLLECTIONS,
  SETUP,
  type Chunk,
  type PdfDocument,
  type Question,
  type Quiz,
  type QuizAttempt,
  type Summary,
  type User,
} from "./schema.ts";

// Cached across hot reloads in dev, otherwise every edit leaks a connection pool.
declare global {
  var _edubotDb: Promise<Db> | undefined;
}

function connect(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set — add it to .env.local");
  }
  // Database name comes from the connection string.
  return new MongoClient(uri)
    .connect()
    .catch((err: Error) => {
      // Atlas accepts the TCP connection then stays silent when the cluster is
      // paused or the IP isn't allow-listed, so the driver's only symptom is a
      // 30s timeout. Say what to actually check.
      if (err.name === "MongoServerSelectionError") {
        throw new Error(
          "Could not reach MongoDB. In Atlas, check that the cluster is not PAUSED " +
            "(Database → Clusters → Resume) and that your IP is allowed " +
            "(Network Access → 0.0.0.0/0). Access lists are per-project, so make " +
            `sure it is the project owning this cluster.\nDriver said: ${err.message}`,
          { cause: err },
        );
      }
      throw err;
    })
    .then(async (client) => {
      const db = client.db();
      // Atlas's copied URI has no database name, and the driver quietly falls
      // back to "test" — fail loudly instead of writing to the wrong database.
      if (db.databaseName === "test") {
        throw new Error(
          'MONGODB_URI has no database name — add "/edubot" before the "?" in the connection string',
        );
      }
      await ensureSetup(db);
      return db;
    });
}

export function getDb(): Promise<Db> {
  return (globalThis._edubotDb ??= connect());
}

/**
 * Creates indexes and attaches the JSON Schema validators. Idempotent, and run
 * once per process on first DB use.
 *
 * ponytail: piggybacks on connect() instead of a separate migration step — one
 * extra round trip per cold start. Move to a one-off `db:setup` script if
 * serverless cold starts make that cost visible.
 */
async function ensureSetup(db: Db): Promise<void> {
  await Promise.all(
    Object.entries(SETUP).map(async ([name, { indexes, required, properties }]) => {
      const validator = {
        $jsonSchema: { bsonType: "object", required, properties },
      };

      try {
        await db.createCollection(name, { validator });
      } catch (err) {
        // Already exists — update the validator in place instead.
        if ((err as { codeName?: string }).codeName !== "NamespaceExists") throw err;
        await db.command({ collMod: name, validator });
      }

      if (indexes.length > 0) {
        await Promise.all(
          indexes.map(([spec, options]) => db.collection(name).createIndex(spec, options)),
        );
      }
    }),
  );
}

// Typed accessors. Callers must scope every query by the owning user —
// row-level isolation is enforced here at the query level, not in the UI (spec §9).
export const users = async () => (await getDb()).collection<User>(COLLECTIONS.users);
export const documents = async () =>
  (await getDb()).collection<PdfDocument>(COLLECTIONS.documents);
export const chunks = async () => (await getDb()).collection<Chunk>(COLLECTIONS.chunks);
export const summaries = async () =>
  (await getDb()).collection<Summary>(COLLECTIONS.summaries);
export const quizzes = async () => (await getDb()).collection<Quiz>(COLLECTIONS.quizzes);
export const questions = async () =>
  (await getDb()).collection<Question>(COLLECTIONS.questions);
export const quizAttempts = async () =>
  (await getDb()).collection<QuizAttempt>(COLLECTIONS.quizAttempts);
