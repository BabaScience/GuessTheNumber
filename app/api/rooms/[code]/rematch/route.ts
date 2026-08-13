import { isValidCode, normalizeCode, phaseOf } from "@/lib/game";
import type { RoomResponse } from "@/lib/protocol";
import { authenticate, fail, ok, publicRoomFor, toRoomView } from "@/lib/server";
import { mutateRoom } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** POST /api/rooms/:code/rematch — clear the board and play the next round. */
export async function POST(req: Request, ctx: Ctx) {
  const code = normalizeCode((await ctx.params).code);
  if (!isValidCode(code)) return fail(400, "That isn't a room code.");

  const auth = await authenticate(code, req);
  if ("error" in auth) return auth.error;

  const outcome = await mutateRoom(code, (room) => {
    if (phaseOf(toRoomView(room)) !== "over") {
      return { commit: false, value: "There's still a round in play." };
    }
    // Either player may call it, and calling twice is harmless: the second
    // caller finds the round already advanced and gets the fresh board back.
    if (room.round !== auth.room.round) return { commit: false, value: null };

    room.round += 1;
    // Swap who shoots first. Whoever guesses first has a real edge, so it
    // alternates rather than sitting with one player all series.
    room.startSeat = (room.startSeat + 1) % 2;
    for (const player of Object.values(room.players)) {
      player.secret = null;
      player.guesses = [];
    }
    return { commit: true, value: null };
  });

  if (!outcome) return fail(404, `No room called ${code}.`);
  if (outcome.value) return fail(409, outcome.value);

  const body: RoomResponse = { room: await publicRoomFor(outcome.room, auth.player.id) };
  return ok(body);
}
