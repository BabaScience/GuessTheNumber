import "server-only";

import { NextResponse } from "next/server";

import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  phaseOf,
  seats,
  turnPlayerId,
  winnerOf,
  type RoomView,
} from "./game";
import type { PublicPlayer, PublicRoom } from "./protocol";
import { getRoom, markSeen, onlinePlayers, type StoredPlayer, type StoredRoom } from "./store";

/* -------------------------------------------------------------------------- */
/* ids and codes                                                              */
/* -------------------------------------------------------------------------- */

export function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    // Modulo bias is irrelevant here: 256 % 32 === 0, so this is uniform.
    out += ROOM_CODE_ALPHABET[bytes[i]! % ROOM_CODE_ALPHABET.length];
  }
  return out;
}

export function newPlayerId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/* -------------------------------------------------------------------------- */
/* responses                                                                  */
/* -------------------------------------------------------------------------- */

export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export const ok = <T>(body: T, status = 200) => NextResponse.json(body, { status });

/* -------------------------------------------------------------------------- */
/* redaction                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Turn a stored room into what one specific player is allowed to see.
 *
 * This is the only path from storage to the network, so a secret can only leak
 * if it leaks here. Opponent secrets are withheld until the round is decided.
 */
export function toPublicRoom(
  room: StoredRoom,
  viewerId: string,
  online: Set<string> = new Set(),
): PublicRoom {
  const view = toRoomView(room);
  const phase = phaseOf(view);
  const revealAll = phase === "over";

  const players: Record<string, PublicPlayer> = {};
  for (const id of room.order) {
    const p = room.players[id];
    if (!p) continue;
    const mine = id === viewerId;
    players[id] = {
      id: p.id,
      name: p.name,
      hasSecret: p.secret !== null,
      secret: mine || revealAll ? p.secret : null,
      guesses: p.guesses,
      wins: p.wins,
      // The viewer is trivially present — they're the one asking.
      online: mine || online.has(id),
    };
  }

  return {
    code: room.code,
    max: room.max,
    levelId: room.levelId,
    levelName: room.levelName,
    order: [...room.order],
    players,
    round: room.round,
    startSeat: room.startSeat,
    rev: room.rev,
    phase,
    turnPlayerId: turnPlayerId(view),
    winnerId: winnerOf(view)?.id ?? null,
  };
}

/** Redact a room for one viewer, refreshing their heartbeat as we go. */
export async function publicRoomFor(room: StoredRoom, viewerId: string): Promise<PublicRoom> {
  const [, online] = await Promise.all([
    markSeen(room.code, viewerId),
    onlinePlayers(room.code, room.order),
  ]);
  return toPublicRoom(room, viewerId, online);
}

/** Stored room reduced to the fields the pure rule functions read. */
export function toRoomView(room: StoredRoom): RoomView {
  return {
    code: room.code,
    max: room.max,
    order: room.order,
    startSeat: room.startSeat,
    round: room.round,
    players: Object.fromEntries(
      Object.values(room.players).map((p) => [
        p.id,
        { id: p.id, name: p.name, hasSecret: p.secret !== null, guesses: p.guesses },
      ]),
    ),
  };
}

export function isRoomFull(room: StoredRoom): boolean {
  return seats(toRoomView(room)).length >= 2;
}

/* -------------------------------------------------------------------------- */
/* auth                                                                       */
/* -------------------------------------------------------------------------- */

export type Authed = { room: StoredRoom; player: StoredPlayer };

/**
 * Resolve the caller's seat from the id + token they replay on every request.
 * Without this any client could POST a guess as the other player, or read the
 * other player's secret straight out of the room payload.
 */
export async function authenticate(
  code: string,
  req: Request,
): Promise<Authed | { error: NextResponse }> {
  const room = await getRoom(code);
  if (!room) return { error: fail(404, `No room called ${code}. Check the code with whoever made it.`) };

  const playerId = req.headers.get("x-player-id") ?? "";
  const token = req.headers.get("x-player-token") ?? "";
  const player = room.players[playerId];

  if (!player || !timingSafeEqual(player.token, token)) {
    return { error: fail(401, "You're not seated in this room.") };
  }
  return { room, player };
}

/** Constant-time compare so token checks don't leak length or prefix. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* -------------------------------------------------------------------------- */
/* body parsing                                                               */
/* -------------------------------------------------------------------------- */

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Accepts a JSON number or a numeric string; rejects everything else. */
export function readInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{1,6}$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}
