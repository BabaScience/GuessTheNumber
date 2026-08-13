import { isValidCode, normalizeCode } from "@/lib/game";
import { authenticate, fail, ok } from "@/lib/server";
import { deleteRoom, mutateRoom } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/rooms/:code/leave — give up your seat.
 *
 * The seat is freed rather than the whole room torn down, so the player who
 * stays keeps the code and can wait for someone else to join on it.
 */
export async function POST(req: Request, ctx: Ctx) {
  const code = normalizeCode((await ctx.params).code);
  if (!isValidCode(code)) return fail(400, "That isn't a room code.");

  const auth = await authenticate(code, req);
  if ("error" in auth) return auth.error;

  const outcome = await mutateRoom(code, (room) => {
    delete room.players[auth.player.id];
    room.order = room.order.filter((id) => id !== auth.player.id);
    // A half-played round can't continue against an empty seat, so reset it
    // and let whoever remains start clean with the next arrival.
    for (const player of Object.values(room.players)) {
      player.secret = null;
      player.guesses = [];
    }
    return { commit: true, value: room.order.length };
  });

  if (outcome && outcome.value === 0) await deleteRoom(code);
  return ok({ left: true });
}
