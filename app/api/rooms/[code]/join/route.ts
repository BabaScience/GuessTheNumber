import { isValidCode, normalizeCode, normalizeName } from "@/lib/game";
import type { JoinResponse } from "@/lib/protocol";
import {
  fail,
  isRoomFull,
  newPlayerId,
  newToken,
  ok,
  publicRoomFor,
  readJson,
} from "@/lib/server";
import { getRoom, mutateRoom, type StoredPlayer } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** POST /api/rooms/:code/join — take the empty second seat. */
export async function POST(req: Request, ctx: Ctx) {
  const code = normalizeCode((await ctx.params).code);
  if (!isValidCode(code)) return fail(400, "Room codes are four characters.");

  const existing = await getRoom(code);
  if (!existing) return fail(404, `No room called ${code}. Check the code with whoever made it.`);
  if (isRoomFull(existing)) return fail(409, "That room already has two players.");

  const body = await readJson(req);
  const name = normalizeName(body.name) || "Player 2";
  const playerId = newPlayerId();
  const token = newToken();

  const outcome = await mutateRoom(code, (room) => {
    // Re-check under the lock: two people can hit an open room at once and
    // only one of them can have the seat.
    if (room.order.length >= 2) return { commit: false, value: false };
    const player: StoredPlayer = {
      id: playerId,
      name,
      secret: null,
      guesses: [],
      token,
      wins: 0,
    };
    room.players[playerId] = player;
    room.order = [...room.order, playerId];
    return { commit: true, value: true };
  });

  if (!outcome) return fail(404, `No room called ${code}.`);
  if (!outcome.value) return fail(409, "Someone else just took that seat.");

  const response: JoinResponse = {
    room: await publicRoomFor(outcome.room, playerId),
    credentials: { code, playerId, token },
  };
  return ok(response, 201);
}
