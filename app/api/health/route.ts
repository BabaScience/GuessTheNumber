import { ok } from "@/lib/server";
import { usingRedis } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — which storage backend did this deployment actually pick up?
 *
 * "memory" on Vercel is the one misconfiguration that looks fine until a second
 * player joins and lands on a different instance, so it's worth being able to
 * check without playing a whole round to find out.
 */
export function GET() {
  return ok({
    ok: true,
    storage: usingRedis ? "redis" : "memory",
    durable: usingRedis,
    // Which region and instance answered. Refresh a few times: if the region
    // ever changes, the regions pin in vercel.json isn't taking effect, and
    // players will end up on machines that can't see each other's rooms.
    region: process.env.VERCEL_REGION ?? "local",
    instance: INSTANCE_ID,
  });
}

/**
 * Random per-process id. Watching this change across refreshes tells you how
 * often instances are being recycled, which is exactly how often an in-memory
 * room would be lost and rebuilt.
 */
const INSTANCE_ID = crypto.randomUUID().slice(0, 8);
