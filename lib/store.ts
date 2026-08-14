import "server-only";

import { MONGODB_DB, mongo, mongoConfigError, usingMongo } from "./mongo";
import {
  PRESENCE_TTL_SECONDS,
  ROOM_TTL_SECONDS,
  type Mutation,
  type StoredPlayer,
  type StoredRoom,
} from "./store-types";

export type { Mutation, StoredPlayer, StoredRoom };
export { PRESENCE_TTL_SECONDS, ROOM_TTL_SECONDS };

/* -------------------------------------------------------------------------- */
/* Backend selection                                                          */
/* -------------------------------------------------------------------------- */

const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "";
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

export const usingRedis = !usingMongo && Boolean(REDIS_URL && REDIS_TOKEN);

/**
 * Which store is in play. "memory" is the fallback and is only correct where
 * there is exactly one server process — a `next dev` session, or `next start`
 * on your own machine.
 *
 * It is NOT correct on Vercel. Serverless scales by running several instances,
 * each with its own memory, and requests are spread across them with no
 * affinity, so two players routinely end up talking to different copies of the
 * same game. See the README.
 */
export const backend: "mongo" | "redis" | "memory" = usingMongo
  ? "mongo"
  : usingRedis
    ? "redis"
    : "memory";

export const isDurable = backend !== "memory";

if (mongoConfigError) {
  console.error(`[higher-lower] ${mongoConfigError}`);
} else if (!isDurable && process.env.VERCEL) {
  console.warn(
    "[higher-lower] No MongoDB configured. Rooms are being kept in instance memory, " +
      "which does not work on Vercel: players get routed to different instances and " +
      "lose each other's games. Set MONGODB_URI, MONGODB_USERNAME and MONGODB_PASSWORD.",
  );
}

const key = (code: string) => `hld:room:${code}`;
const lockKey = (code: string) => `hld:lock:${code}`;
const seenKey = (code: string, playerId: string) => `hld:seen:${code}:${playerId}`;

/* -------------------------------------------------------------------------- */
/* In-memory backend — local development only                                 */
/* -------------------------------------------------------------------------- */

type MemoryEntry = { room: StoredRoom; expiresAt: number };

const { memory, memorySeen } = (() => {
  const g = globalThis as typeof globalThis & {
    __hldRooms?: Map<string, MemoryEntry>;
    __hldSeen?: Map<string, number>;
  };
  g.__hldRooms ??= new Map();
  g.__hldSeen ??= new Map();
  return { memory: g.__hldRooms, memorySeen: g.__hldSeen };
})();

function memorySweep(now: number) {
  for (const [k, entry] of memory) if (entry.expiresAt <= now) memory.delete(k);
  for (const [k, expiresAt] of memorySeen) if (expiresAt <= now) memorySeen.delete(k);
}

/* -------------------------------------------------------------------------- */
/* Upstash REST helper                                                        */
/* -------------------------------------------------------------------------- */

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis command failed (${res.status})`);
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error(`Redis error: ${body.error}`);
  return body.result ?? null;
}

const expiryDate = () => new Date(Date.now() + ROOM_TTL_SECONDS * 1000);

/* -------------------------------------------------------------------------- */
/* Rooms                                                                      */
/* -------------------------------------------------------------------------- */

export async function getRoom(code: string): Promise<StoredRoom | null> {
  if (usingMongo) {
    const { rooms } = await mongo();
    const doc = await rooms.findOne({ _id: code });
    // The TTL monitor only sweeps about once a minute, so an expired room can
    // still be sitting there. Treat it as gone rather than serving it.
    if (!doc || doc.expiresAt.getTime() <= Date.now()) return null;
    return doc.room;
  }

  if (usingRedis) {
    const raw = await redis(["GET", key(code)]);
    if (typeof raw !== "string") return null;
    try {
      return JSON.parse(raw) as StoredRoom;
    } catch {
      return null;
    }
  }

  const now = Date.now();
  memorySweep(now);
  const entry = memory.get(code);
  if (!entry || entry.expiresAt <= now) return null;
  // Hand out a copy: callers mutate what they get, and a rejected mutation
  // must not leave half-finished edits in the live map.
  return structuredClone(entry.room);
}

export async function putRoom(room: StoredRoom): Promise<void> {
  room.updatedAt = Date.now();

  if (usingMongo) {
    const { rooms } = await mongo();
    await rooms.updateOne(
      { _id: room.code },
      { $set: { room, expiresAt: expiryDate() } },
      { upsert: true },
    );
    return;
  }

  if (usingRedis) {
    await redis(["SET", key(room.code), JSON.stringify(room), "EX", ROOM_TTL_SECONDS]);
    return;
  }

  memory.set(room.code, { room, expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 });
}

/** Create only if the code is free. Returns false when the code is taken. */
export async function createRoom(room: StoredRoom): Promise<boolean> {
  if (usingMongo) {
    const { rooms } = await mongo();
    try {
      await rooms.insertOne({ _id: room.code, room, expiresAt: expiryDate() });
      return true;
    } catch (err) {
      // Duplicate _id — someone else holds this code. Unless it is simply an
      // expired room the TTL monitor hasn't collected yet, in which case the
      // code is genuinely free and we take it over.
      if (!isDuplicateKey(err)) throw err;
      const claimed = await rooms.updateOne(
        { _id: room.code, expiresAt: { $lte: new Date() } },
        { $set: { room, expiresAt: expiryDate() } },
      );
      return claimed.modifiedCount === 1;
    }
  }

  if (usingRedis) {
    const result = await redis([
      "SET",
      key(room.code),
      JSON.stringify(room),
      "NX",
      "EX",
      ROOM_TTL_SECONDS,
    ]);
    return result !== null;
  }

  const now = Date.now();
  memorySweep(now);
  const existing = memory.get(room.code);
  if (existing && existing.expiresAt > now) return false;
  memory.set(room.code, { room, expiresAt: now + ROOM_TTL_SECONDS * 1000 });
  return true;
}

function isDuplicateKey(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: number }).code === 11000);
}

export async function deleteRoom(code: string): Promise<void> {
  if (usingMongo) {
    const { rooms, presence } = await mongo();
    await Promise.all([rooms.deleteOne({ _id: code }), presence.deleteMany({ code })]);
    return;
  }
  if (usingRedis) {
    await redis(["DEL", key(code)]);
    return;
  }
  memory.delete(code);
}

/* -------------------------------------------------------------------------- */
/* Presence                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Presence lives outside the room document. Writing a heartbeat into the room
 * on every poll would be a read-modify-write per second per player, and one of
 * those could easily overwrite a guess that landed in between.
 */
export async function markSeen(code: string, playerId: string): Promise<void> {
  if (usingMongo) {
    const { presence } = await mongo();
    const now = new Date();
    await presence.updateOne(
      { _id: `${code}:${playerId}` },
      {
        $set: {
          code,
          playerId,
          seenAt: now,
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        },
      },
      { upsert: true },
    );
    return;
  }
  if (usingRedis) {
    await redis(["SET", seenKey(code, playerId), "1", "EX", PRESENCE_TTL_SECONDS]);
    return;
  }
  memorySeen.set(seenKey(code, playerId), Date.now() + PRESENCE_TTL_SECONDS * 1000);
}

export async function onlinePlayers(code: string, playerIds: string[]): Promise<Set<string>> {
  const online = new Set<string>();
  if (playerIds.length === 0) return online;

  if (usingMongo) {
    const { presence } = await mongo();
    // Filter on seenAt rather than trusting the TTL sweep, which is far too
    // coarse for a 15-second presence window.
    const cutoff = new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000);
    const docs = await presence
      .find({ code, playerId: { $in: playerIds }, seenAt: { $gt: cutoff } })
      .toArray();
    for (const doc of docs) online.add(doc.playerId);
    return online;
  }

  if (usingRedis) {
    const values = await redis(["MGET", ...playerIds.map((id) => seenKey(code, id))]);
    if (Array.isArray(values)) {
      playerIds.forEach((id, i) => {
        if (values[i] != null) online.add(id);
      });
    }
    return online;
  }

  const now = Date.now();
  for (const id of playerIds) {
    const expiresAt = memorySeen.get(seenKey(code, id));
    if (expiresAt && expiresAt > now) online.add(id);
  }
  return online;
}

/* -------------------------------------------------------------------------- */
/* Mutation                                                                   */
/* -------------------------------------------------------------------------- */

const LOCK_TTL_SECONDS = 5;
const LOCK_RETRIES = 25;
const LOCK_RETRY_MS = 40;
const CAS_RETRIES = 6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read-modify-write a room without losing a concurrent update. The callback
 * edits the room in place and says whether to keep the edit.
 *
 * Mongo uses compare-and-set on `rev`: the update only matches if nobody else
 * has written since we read, and a lost race simply retries against fresh
 * state. No lock to acquire, and nothing to leak if an instance dies mid-write.
 *
 * Resolves to null only when the room doesn't exist.
 */
export async function mutateRoom<T>(
  code: string,
  mutate: (room: StoredRoom) => Mutation<T>,
): Promise<{ room: StoredRoom; value: T } | null> {
  if (usingMongo) {
    const { rooms } = await mongo();
    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const room = await getRoom(code);
      if (!room) return null;

      const seenRev = room.rev;
      const outcome = mutate(room);
      if (!outcome.commit) return { room, value: outcome.value };

      room.rev = seenRev + 1;
      room.updatedAt = Date.now();
      const res = await rooms.updateOne(
        { _id: code, "room.rev": seenRev },
        { $set: { room, expiresAt: expiryDate() } },
      );
      if (res.matchedCount === 1) return { room, value: outcome.value };

      // Somebody wrote first. Re-read and replay the decision against the
      // state that actually won.
      await sleep(15 * (attempt + 1));
    }
    throw new Error("Room is busy — try again in a moment.");
  }

  const run = async () => {
    const room = await getRoom(code);
    if (!room) return null;
    const outcome = mutate(room);
    if (!outcome.commit) return { room, value: outcome.value };
    room.rev += 1;
    await putRoom(room);
    return { room, value: outcome.value };
  };

  if (!usingRedis) return run();

  const stamp = crypto.randomUUID();
  let held = false;
  for (let i = 0; i < LOCK_RETRIES; i++) {
    const got = await redis(["SET", lockKey(code), stamp, "NX", "EX", LOCK_TTL_SECONDS]);
    if (got !== null) {
      held = true;
      break;
    }
    await sleep(LOCK_RETRY_MS);
  }
  if (!held) throw new Error("Room is busy — try again in a moment.");

  try {
    return await run();
  } finally {
    // Only release if the lock is still ours; it may have expired and been
    // retaken, and a plain DEL would free somebody else's.
    await redis([
      "EVAL",
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
      1,
      lockKey(code),
      stamp,
    ]).catch(() => undefined);
  }
}

/** Round-trip check used by /api/health. */
export async function storeHealth(): Promise<{ ok: boolean; detail: string }> {
  if (mongoConfigError) return { ok: false, detail: mongoConfigError };
  if (!usingMongo) return { ok: true, detail: backend };
  try {
    const { db } = await mongo();
    await db.command({ ping: 1 });
    return { ok: true, detail: `mongo (${MONGODB_DB})` };
  } catch (err) {
    // Surface the driver's own message: it distinguishes bad credentials from
    // an IP that the cluster's access list hasn't been told about, which is the
    // most common first-deploy problem.
    return { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
  }
}
