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
  });
}
