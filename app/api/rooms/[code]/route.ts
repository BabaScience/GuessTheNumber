import { normalizeCode, isValidCode } from "@/lib/game";
import type { RoomResponse, UnchangedResponse } from "@/lib/protocol";
import { authenticate, fail, ok, publicRoomFor } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/**
 * GET /api/rooms/:code — the poll endpoint.
 *
 * Pass `?since=<rev>` and you get a tiny `{ unchanged: true }` back whenever
 * nothing has happened, which is the common case while you wait for the other
 * player to move.
 */
export async function GET(req: Request, ctx: Ctx) {
  const code = normalizeCode((await ctx.params).code);
  if (!isValidCode(code)) return fail(400, "That isn't a room code.");

  const auth = await authenticate(code, req);
  if ("error" in auth) return auth.error;

  const since = Number.parseInt(new URL(req.url).searchParams.get("since") ?? "", 10);
  if (Number.isInteger(since) && since === auth.room.rev) {
    // Still refresh presence even when there's nothing else to send back,
    // otherwise a waiting player would look offline to their opponent.
    const redacted = await publicRoomFor(auth.room, auth.player.id);
    const body: UnchangedResponse = {
      unchanged: true,
      rev: auth.room.rev,
      online: Object.values(redacted.players).filter((p) => p.online).map((p) => p.id),
    };
    return ok(body);
  }

  const body: RoomResponse = { room: await publicRoomFor(auth.room, auth.player.id) };
  return ok(body);
}
