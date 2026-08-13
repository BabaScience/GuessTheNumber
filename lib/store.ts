import "server-only";

import type { Guess } from "./game";

/* -------------------------------------------------------------------------- */
/* Server-side room shape (secrets and tokens live here and never leave)       */
/* -------------------------------------------------------------------------- */

export type StoredPlayer = {
  id: string;
  name: string;
  /** The number this player chose for their opponent to hunt. Never sent out. */
  secret: number | null;
  guesses: Guess[];
  /** Bearer secret proving "I am this seat". Never sent to the other player. */
  token: string;
  /** Rounds this player has won in this room. */
  wins: number;
};

export type StoredRoom = {
  code: string;
  max: number;
  levelId: string;
  levelName: string;
  order: string[];
  players: Record<string, StoredPlayer>;
  round: number;
  startSeat: number;
  /** Bumped on every mutation so clients can cheaply detect "nothing new". */
  rev: number;
  createdAt: number;
  updatedAt: number;
  /** When a reclaim last rebuilt this room, so clients can explain the reset. */
  restartedAt?: number | null;
};

/** Rooms disappear this long after the last action. */
export const ROOM_TTL_SECONDS = 60 * 60 * 6;

/* -------------------------------------------------------------------------- */
/* Backend selection                                                          */
/* -------------------------------------------------------------------------- */

const REDIS_URL =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "";
const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

export const usingRedis = Boolean(REDIS_URL && REDIS_TOKEN);

const key = (code: string) => `hld:room:${code}`;
const lockKey = (code: string) => `hld:lock:${code}`;
const seenKey = (code: string, playerId: string) => `hld:seen:${code}:${playerId}`;

/**
 * How long after a player's last request we still consider them present.
 * Clients poll well inside this, so a real disconnect surfaces in a few seconds
 * while an ordinary slow request never flickers them offline.
 */
export const PRESENCE_TTL_SECONDS = 15;

/* -------------------------------------------------------------------------- */
/* In-memory backend — used for local dev and whenever Redis isn't configured  */
/* -------------------------------------------------------------------------- */

type MemoryEntry = { room: StoredRoom; expiresAt: number };

/**
 * Survives Next.js dev-server hot reloads by hanging off globalThis; without
 * this every edit would silently wipe every open room.
 */
const { memory, memorySeen } = (() => {
  const g = globalThis as typeof globalThis & {
    __hldRooms?: Map<string, MemoryEntry>;
    __hldSeen?: Map<string, number>;
  };
  if (!g.__hldRooms) g.__hldRooms = new Map();
  if (!g.__hldSeen) g.__hldSeen = new Map();
  return { memory: g.__hldRooms, memorySeen: g.__hldSeen };
})();

function memorySweep(now: number) {
  for (const [k, entry] of memory) if (entry.expiresAt <= now) memory.delete(k);
  for (const [k, expiresAt] of memorySeen) if (expiresAt <= now) memorySeen.delete(k);
}

/* -------------------------------------------------------------------------- */
/* Upstash REST helpers                                                       */
/* -------------------------------------------------------------------------- */

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Redis command failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error(`Redis error: ${body.error}`);
  return body.result ?? null;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function getRoom(code: string): Promise<StoredRoom | null> {
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
  // Hand out a copy. Callers mutate what they get back, and a rejected
  // mutation must not leave its half-finished edits in the live map.
  return structuredClone(entry.room);
}

export async function putRoom(room: StoredRoom): Promise<void> {
  room.updatedAt = Date.now();
  if (usingRedis) {
    await redis(["SET", key(room.code), JSON.stringify(room), "EX", ROOM_TTL_SECONDS]);
    return;
  }
  memory.set(room.code, { room, expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 });
}

/** Create only if the code is free. Returns false when the code is taken. */
export async function createRoom(room: StoredRoom): Promise<boolean> {
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

export async function deleteRoom(code: string): Promise<void> {
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
 * Presence lives in its own short-lived keys rather than inside the room.
 * Writing a heartbeat into the room on every poll would mean a read-modify-write
 * once a second per player, and one of those could easily overwrite a guess that
 * landed in between.
 */
export async function markSeen(code: string, playerId: string): Promise<void> {
  if (usingRedis) {
    await redis(["SET", seenKey(code, playerId), "1", "EX", PRESENCE_TTL_SECONDS]);
    return;
  }
  memorySeen.set(seenKey(code, playerId), Date.now() + PRESENCE_TTL_SECONDS * 1000);
}

export async function onlinePlayers(code: string, playerIds: string[]): Promise<Set<string>> {
  const online = new Set<string>();
  if (playerIds.length === 0) return online;

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
/* Mutation with a lock                                                       */
/* -------------------------------------------------------------------------- */

const LOCK_TTL_SECONDS = 5;
const LOCK_RETRIES = 25;
const LOCK_RETRY_MS = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Outcome of a mutation callback. `commit: false` means the room is left
 * untouched — used to reject a move while still reporting why.
 */
export type Mutation<T> = { commit: boolean; value: T };

/**
 * Read-modify-write a room without losing a concurrent update. The callback
 * edits the room in place and says whether to keep the edit.
 *
 * With Redis this takes a short `SET NX` lock first, because two players can
 * hit two different serverless instances at the same moment. In memory there is
 * nothing to lock: Node runs the whole callback on one thread with no await
 * against a remote store in between, so the read and the write are atomic.
 *
 * Resolves to null only when the room doesn't exist.
 */
export async function mutateRoom<T>(
  code: string,
  mutate: (room: StoredRoom) => Mutation<T>,
): Promise<{ room: StoredRoom; value: T } | null> {
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
    // Only release the lock if it is still ours (it may have expired and been
    // retaken); a plain DEL could otherwise free somebody else's lock.
    await redis([
      "EVAL",
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
      1,
      lockKey(code),
      stamp,
    ]).catch(() => undefined);
  }
}
