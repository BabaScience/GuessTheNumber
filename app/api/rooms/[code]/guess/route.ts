import {
  isValidCode,
  judge,
  normalizeCode,
  phaseOf,
  turnPlayerId,
  validateGuess,
  type Guess,
} from "@/lib/game";
import type { GuessResponse } from "@/lib/protocol";
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

type Verdict =
  | { status: "ok"; guess: Guess }
  | { status: "rejected"; code: number; reason: string };

/**
 * POST /api/rooms/:code/guess — name a number.
 *
 * Everything that decides the answer happens here: the opponent's secret is
 * only ever compared against, never returned, so the guesser learns exactly one
 * bit ("higher" or "lower") per turn and nothing more.
 */
export async function POST(req: Request, ctx: Ctx) {
  const code = normalizeCode((await ctx.params).code);
  if (!isValidCode(code)) return fail(400, "That isn't a room code.");

  const auth = await authenticate(code, req);
  if ("error" in auth) return auth.error;

  const value = readInt((await readJson(req)).value);
  if (value === null) return fail(400, "Send a number.");

  const outcome = await mutateRoom(code, (room): { commit: boolean; value: Verdict } => {
    const view = toRoomView(room);
    const me = room.players[auth.player.id];
    const reject = (code: number, reason: string) =>
      ({ commit: false, value: { status: "rejected" as const, code, reason } });

    if (!me) return reject(401, "You're not seated in this room.");
    if (phaseOf(view) !== "duel") return reject(409, "The round isn't running.");
    if (turnPlayerId(view) !== me.id) return reject(409, "It's not your turn yet.");

    // Read the opponent off the stored room, not the redacted view — this is
    // the one place the secret itself is needed.
    const foeId = room.order.find((id) => id !== me.id);
    const foe = foeId ? room.players[foeId] : undefined;
    if (!foe || foe.secret === null) return reject(409, "Your opponent hasn't picked a number.");

    const check = validateGuess(view.players[me.id]!, value, room.max);
    if (!check.ok) return reject(400, check.reason);

    const guess: Guess = { value, result: judge(value, foe.secret), at: Date.now() };
    me.guesses = [...me.guesses, guess];
    if (guess.result === "correct") me.wins += 1;

    return { commit: true, value: { status: "ok", guess } };
  });

  if (!outcome) return fail(404, `No room called ${code}.`);
  if (outcome.value.status === "rejected") {
    return fail(outcome.value.code, outcome.value.reason);
  }

  const body: GuessResponse = {
    room: await publicRoomFor(outcome.room, auth.player.id),
    result: outcome.value.guess,
  };
  return ok(body);
}
