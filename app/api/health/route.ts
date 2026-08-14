import { NextResponse } from "next/server";

import { backend, isDurable, storeHealth } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Random per-process id. Refreshing this endpoint a few times shows how many
 * instances are answering you — the thing that makes in-memory storage
 * unworkable here.
 */
const INSTANCE_ID = crypto.randomUUID().slice(0, 8);

/**
 * GET /api/health — is this deployment actually able to run a game?
 *
 * `durable: false` on Vercel is the one misconfiguration that looks fine until
 * a second player joins: each instance would keep its own copy of the room and
 * the two of you would drift apart mid-game.
 */
export async function GET() {
  const store = await storeHealth();

  return NextResponse.json(
    {
      ok: store.ok && isDurable,
      storage: backend,
      durable: isDurable,
      store: store.detail,
      region: process.env.VERCEL_REGION ?? "local",
      instance: INSTANCE_ID,
      ...(isDurable
        ? {}
        : {
            warning:
              "Rooms are kept in this instance's memory. That is fine locally, " +
              "but on Vercel each instance has its own copy and players will lose " +
              "each other's games. Set MONGODB_URI.",
          }),
    },
    { status: store.ok && isDurable ? 200 : 503 },
  );
}
