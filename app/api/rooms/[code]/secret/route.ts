import { isValidCode, normalizeCode, phaseOf, validateSecret } from "@/lib/game";
import type { RoomResponse } from "@/lib/protocol";
import {
  authenticate,
  fail,
  ok,
  publicRoomFor,
  readInt,
  readJson,
  toRoomView,
} from "@/lib/server";
import { mutateRoom } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** POST /api/rooms/:code/secret — lock in the number your opponent will hunt. */
export async function POST(req: Request, ctx: Ctx) {
  const code = normalizeCode((await ctx.params).code);
  if (!isValidCode(code)) return fail(400, "That isn't a room code.");

  const auth = await authenticate(code, req);
  if ("error" in auth) return auth.error;

  const value = readInt((await readJson(req)).value);
  if (value === null) return fail(400, "Send a number.");

  const check = validateSecret(value, auth.room.max);
  if (!check.ok) return fail(400, check.reason);

  const outcome = await mutateRoom(code, (room) => {
    const player = room.players[auth.player.id];
    if (!player) return { commit: false, value: "You're not seated in this room." };
    if (phaseOf(toRoomView(room)) !== "pick") {
      return { commit: false, value: "The room isn't picking numbers right now." };
    }
    // Locking is one-way: changing it mid-round would let you dodge a guess
    // that was about to land.
    if (player.secret !== null) return { commit: false, value: "Your number is already locked in." };
    player.secret = value;
    return { commit: true, value: null };
  });

  if (!outcome) return fail(404, `No room called ${code}.`);
  if (outcome.value) return fail(409, outcome.value);

  const body: RoomResponse = { room: await publicRoomFor(outcome.room, auth.player.id) };
  return ok(body);
}
