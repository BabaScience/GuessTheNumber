import { DEFAULT_LEVEL_ID, levelById, normalizeName } from "@/lib/game";
import type { JoinResponse } from "@/lib/protocol";
import {
  fail,
  newPlayerId,
  newRoomCode,
  newToken,
  ok,
  publicRoomFor,
  readJson,
} from "@/lib/server";
import { createRoom, type StoredRoom } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_ATTEMPTS = 8;

/** POST /api/rooms — open a new room and take the host seat. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const level = levelById(String(body.levelId ?? DEFAULT_LEVEL_ID));
  if (!level) return fail(400, "Unknown difficulty.");

  const name = normalizeName(body.name) || "Player 1";
  const playerId = newPlayerId();
  const token = newToken();
  const now = Date.now();

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = newRoomCode();
    const room: StoredRoom = {
      code,
      max: level.max,
      levelId: level.id,
      levelName: level.name,
      order: [playerId],
      players: {
        [playerId]: { id: playerId, name, secret: null, guesses: [], token, wins: 0 },
      },
      round: 0,
      // Round 0 starts with the guest, so the host doesn't get first strike
      // simply for having opened the room. It alternates every rematch.
      startSeat: 1,
      rev: 1,
      createdAt: now,
      updatedAt: now,
    };

    // createRoom is NX, so a code collision loses the race rather than
    // silently stomping somebody else's game.
    if (await createRoom(room)) {
      const response: JoinResponse = {
        room: await publicRoomFor(room, playerId),
        credentials: { code, playerId, token },
      };
      return ok(response, 201);
    }
  }

  return fail(503, "Couldn't find a free room code. Try again.");
}
