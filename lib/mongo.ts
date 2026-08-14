import "server-only";

import { MongoClient, type Collection, type Db } from "mongodb";

import { resolveMongoConfig } from "./mongo-config";
import type { StoredRoom } from "./store-types";

const resolved = resolveMongoConfig(process.env);

/** True as soon as any MongoDB variable is present, even a broken set. */
export const usingMongo = resolved.configured;

/** Non-empty when the settings are present but unusable. */
export const mongoConfigError =
  resolved.configured && !resolved.ok ? resolved.error : "";

export const MONGODB_DB =
  resolved.configured && resolved.ok ? resolved.config.database : "";

export type RoomDoc = {
  /** The room code. Using it as _id gives us uniqueness for free. */
  _id: string;
  room: StoredRoom;
  /** TTL index target — Mongo deletes the document once this passes. */
  expiresAt: Date;
};

export type PresenceDoc = {
  /** `${code}:${playerId}` */
  _id: string;
  code: string;
  playerId: string;
  seenAt: Date;
  expiresAt: Date;
};

type Handles = {
  client: MongoClient;
  db: Db;
  rooms: Collection<RoomDoc>;
  presence: Collection<PresenceDoc>;
};

/**
 * One client per process, reused across invocations.
 *
 * This is the part serverless gets wrong by default: a fresh MongoClient per
 * request means a fresh TCP handshake and authentication every time, and a
 * connection pool that is never reused. Atlas caps concurrent connections, so
 * that approach runs out of them under exactly the load it is meant to handle.
 * Hanging the promise off globalThis also survives dev-server hot reloads.
 */
const globalForMongo = globalThis as typeof globalThis & {
  __hldMongo?: Promise<Handles>;
};

async function connect(): Promise<Handles> {
  if (!resolved.configured) throw new Error("MongoDB is not configured.");
  if (!resolved.ok) throw new Error(resolved.error);
  const { uri, username, password, database } = resolved.config;

  const client = new MongoClient(uri, {
    // Credentials as options rather than inside the URI, so a password
    // containing @ / : needs no percent-encoding to work.
    auth: { username, password },
    // Small pool: a serverless instance serves a handful of concurrent
    // requests, and every idle socket is one Atlas cannot give to someone else.
    maxPoolSize: 10,
    minPoolSize: 0,
    // Fail fast rather than hanging a player's turn on an unreachable cluster.
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    retryWrites: true,
  });

  await client.connect();
  const db = client.db(database);
  const rooms = db.collection<RoomDoc>("rooms");
  const presence = db.collection<PresenceDoc>("presence");

  // Idempotent, so neither collection needs manual setup — deploying against an
  // empty cluster is enough. Mongo's TTL monitor sweeps roughly once a minute,
  // so these bound growth rather than expire anything precisely; where exact
  // timing matters we filter by timestamp at query time instead.
  await Promise.all([
    rooms.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    presence.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  return { client, db, rooms, presence };
}

export function mongo(): Promise<Handles> {
  globalForMongo.__hldMongo ??= connect().catch((err) => {
    // Never cache a failed connection, or the instance is poisoned until it
    // recycles and every request fails for the life of the process.
    globalForMongo.__hldMongo = undefined;
    throw err;
  });
  return globalForMongo.__hldMongo;
}
