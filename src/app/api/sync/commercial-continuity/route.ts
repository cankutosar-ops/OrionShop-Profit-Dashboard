import { NextResponse } from "next/server";
import { authorize, isAuthzFailure } from "@/lib/security/authorize";
import { isInternalServiceRequest } from "@/lib/security/require-auth";
import { tryResolveInternalApiSecret } from "@/lib/security/secrets";
import { COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS } from "@/lib/commercial-continuity/execution-bounds";
import { syncLog } from "@/lib/wildberries/sync-log";
import { runCommercialContinuityTick } from "@/services/commercial-continuity-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Durable commercial continuity scheduler contract.
 *
 * GET/POST /api/sync/commercial-continuity
 *
 * Authentication (any one):
 * - Authorization: Bearer <INTERNAL_API_SECRET>
 * - Authorization: Bearer <CRON_SECRET>
 * - x-orion-containment: <INTERNAL_API_SECRET>
 * - Vercel Cron: Authorization Bearer CRON_SECRET (standard)
 *
 * Does NOT require dashboard/browser session.
 * Invokes Orders/Sales/Finance via existing sync services.
 *
 * Scheduled cron runs a **bounded blocking tick** (≤ maxDuration − buffer).
 * Durable retry/backoff (`next_retry_at`) handles follow-up attempts hourly.
 */
function isCronAuthorized(request: Request): boolean {
  if (isInternalServiceRequest(request)) return true;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  return bearer === cronSecret;
}

function unauthorized() {
  return NextResponse.json(
    {
      error: "Unauthorized",
      code: "CRON_AUTH_REQUIRED",
      message:
        "Commercial continuity requires INTERNAL_API_SECRET or CRON_SECRET Bearer token.",
    },
    { status: 401 }
  );
}

async function handleTick(request: Request, opts: { force: boolean }) {
  if (!isCronAuthorized(request) && !isInternalServiceRequest(request)) {
    const authz = await authorize(request);
    if (isAuthzFailure(authz)) return unauthorized();
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get("marketplaceAccountId") ?? undefined;
  const force = opts.force || url.searchParams.get("force") === "1";

  syncLog("commercial-continuity", "TICK REQUEST", {
    mode: "blocking_bounded",
    force,
    marketplaceAccountId: accountId ?? null,
    executionBudgetMs: COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS,
  });

  const result = await runCommercialContinuityTick({
    trigger: "scheduled",
    force,
    marketplaceAccountId: accountId,
    executionBudgetMs: COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS,
  });

  return NextResponse.json({
    ok: true,
    mode: "blocking_bounded",
    executionBudgetMs: COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS,
    ...result,
  });
}

/** Vercel Cron — bounded blocking tick within maxDuration. */
export async function GET(request: Request) {
  return handleTick(request, { force: false });
}

/** Manual / CLI / ops — same bounded blocking model. */
export async function POST(request: Request) {
  let body: { force?: boolean; marketplaceAccountId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  if (body.marketplaceAccountId) {
    const url = new URL(request.url);
    url.searchParams.set("marketplaceAccountId", body.marketplaceAccountId);
    const rewritten = new Request(url.toString(), request);
    return handleTick(rewritten, { force: !!body.force });
  }

  return handleTick(request, { force: !!body.force });
}

/** Health probe for deployment docs — does not run sync. */
export async function HEAD() {
  const hasSecret = !!(tryResolveInternalApiSecret() || process.env.CRON_SECRET);
  return new NextResponse(null, {
    status: hasSecret ? 204 : 503,
  });
}
