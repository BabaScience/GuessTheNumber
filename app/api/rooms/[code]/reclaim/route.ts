import { isValidCode, levelById, normalizeCode, normalizeName } from "@/lib/game";
import type { RoomResponse } from "@/lib/protocol";
import { fail, ok, publicRoomFor, readInt, readJson } from "@/lib/server";
import { createRoom, mutateRoom, type StoredPlayer, type StoredRoom } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/rooms/:code/reclaim — put a seat back after the server forgot it.
 *
 * Rooms live in the memory of whichever serverless instance is handling
 * requests, so an instance recycling takes the room with it. Rather than
 * losing the game, each client can re-register the half of the state it
 * already holds: who it is, what the room was set to, and the running score.
 *
 * What it deliberately cannot restore is the round in progress. Secrets and
 * guesses stay server-only by design, so there is nothing in the browser to
 * replay — and if there were, a player could replay a stale copy to change the
 * number they had already committed to. Both players re-pick instead, which is
 * symmetric and visible to each of them.
 */
export async function POST(req: Request, ctx: Ctx) {
  const code = normalizeCode((await ctx.params).code);
  if (!isValidCode(code)) return fail(400, "That isn't a room code.");

  const body = await readJson(req);
  const playerId = typeof body.playerId === "string" ? body.playerId : "";
  const token = typeof body.token === "string" ? body.token : "";
  const level = levelById(String(body.levelId ?? ""));
  const name = normalizeName(body.name) || "Player";
  const wins = readInt(body.wins) ?? 0;
  const round = readInt(body.round) ?? 0;

  if (!playerId || !token) return fail(400, "Nothing to reclaim with.");
  if (!level) return fail(400, "Unknown difficulty.");

  const seat = (): StoredPlayer => ({
    id: playerId,
    name,
    secret: null,
    guesses: [],
    token,
    // Trusting the client's own scoreline. It is a friendly tally, not a
    // game rule, and the alternative is throwing away a real series.
    wins: Math.max(0, Math.min(wins, 999)),
  });

  const existing = await mutateRoom(code, (room) => {
    if (room.players[playerId]) {
      // Already seated — somebody else's reclaim rebuilt us, or this is a
      // duplicate request. Nothing to do.
      return { commit: false, value: "seated" as const };
    }
    if (room.order.length >= 2) return { commit: false, value: "full" as const };

    room.players[playerId] = seat();
    room.order = [...room.order, playerId];
    // The room came back without us, so whatever round was underway is not
    // playable. Clear it for everyone rather than leaving a half-board.
    for (const player of Object.values(room.players)) {
      player.secret = null;
      player.guesses = [];
    }
    room.restartedAt = Date.now();
    return { commit: true, value: "joined" as const };
  });

  if (existing) {
    if (existing.value === "full") return fail(409, "That room already has two players.");
    const body: RoomResponse = { room: await publicRoomFor(existing.room, playerId) };
    return ok(body);
  }

  // The room is gone entirely — rebuild it from scratch around this player.
  const now = Date.now();
  const rebuilt: StoredRoom = {
    code,
    max: level.max,
    levelId: level.id,
    levelName: level.name,
    order: [playerId],
    players: { [playerId]: seat() },
    round: Math.max(0, Math.min(round, 9999)),
    startSeat: 1,
    rev: 1,
    createdAt: now,
    updatedAt: now,
    restartedAt: now,
  };

  if (!(await createRoom(rebuilt))) {
    // Both players raced to rebuild and the other one won. Retry as a join.
    const joined = await mutateRoom(code, (room) => {
      if (room.players[playerId]) return { commit: false, value: true };
      if (room.order.length >= 2) return { commit: false, value: false };
      room.players[playerId] = seat();
      room.order = [...room.order, playerId];
      return { commit: true, value: true };
    });
    if (!joined || !joined.value) return fail(409, "Couldn't get your seat back.");
    const body: RoomResponse = { room: await publicRoomFor(joined.room, playerId) };
    return ok(body);
  }

  const response: RoomResponse = { room: await publicRoomFor(rebuilt, playerId) };
  return ok(response);
}
