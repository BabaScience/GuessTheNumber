/**
 * Resolving the MongoDB connection settings from the environment.
 *
 * Pure and dependency-free so it can be tested without a cluster.
 */

export type MongoConfig = {
  /** Connection string with any inline credentials stripped out. */
  uri: string;
  username: string;
  password: string;
  database: string;
};

export type MongoConfigResult =
  | { configured: false }
  | { configured: true; ok: true; config: MongoConfig }
  | { configured: true; ok: false; error: string };

export const DEFAULT_DATABASE = "higher_lower";

const MONGO_KEYS = ["MONGODB_URI", "MONGODB_USERNAME", "MONGODB_PASSWORD"] as const;

/**
 * Strip `user:pass@` from the authority.
 *
 * Credentials go to the driver as separate options instead. Atlas passwords
 * routinely contain `@`, `/` and `:`, which have to be percent-encoded to
 * survive inside a URI — getting that wrong produces an authentication failure
 * that looks nothing like an encoding problem. Handing them over separately
 * sidesteps the encoding question entirely.
 */
export function stripInlineCredentials(uri: string): string {
  return uri.replace(/^(mongodb(?:\+srv)?:\/\/)[^/?#]*@/i, "$1");
}

export function resolveMongoConfig(env: Record<string, string | undefined>): MongoConfigResult {
  const uri = (env.MONGODB_URI ?? "").trim();
  const username = (env.MONGODB_USERNAME ?? "").trim();
  const password = env.MONGODB_PASSWORD ?? "";
  const database = (env.MONGODB_DB ?? "").trim() || DEFAULT_DATABASE;

  // Nothing set at all: the caller falls back to in-memory storage, which is
  // correct for local development.
  if (!uri && !username && !password) return { configured: false };

  // Something set, but not everything. Treated as an error rather than a quiet
  // fallback — silently running in memory is the failure mode that breaks a
  // deployment in a way nobody notices until two people try to play.
  const missing = MONGO_KEYS.filter((key) => !(env[key] ?? "").trim());
  if (missing.length > 0) {
    return {
      configured: true,
      ok: false,
      error: `MongoDB is partly configured: ${missing.join(", ")} ${
        missing.length === 1 ? "is" : "are"
      } missing. Set all of ${MONGO_KEYS.join(", ")}, or none of them to use in-memory storage.`,
    };
  }

  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
    return {
      configured: true,
      ok: false,
      error: "MONGODB_URI must start with mongodb:// or mongodb+srv://.",
    };
  }

  // Atlas hands you a template with the credentials as placeholders. Leaving
  // them in place is a common copy-paste slip, and the driver's error for it is
  // not obvious.
  if (/<[^>]+>/.test(uri)) {
    return {
      configured: true,
      ok: false,
      error:
        "MONGODB_URI still contains a <placeholder>. Remove the credentials from the " +
        "URI entirely — they belong in MONGODB_USERNAME and MONGODB_PASSWORD.",
    };
  }

  return {
    configured: true,
    ok: true,
    config: { uri: stripInlineCredentials(uri), username, password, database },
  };
}
