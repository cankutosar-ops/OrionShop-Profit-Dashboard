import { NextResponse } from "next/server";
import { authorize, isAuthzFailure, authForbiddenResponse } from "@/lib/security/authorize";
import {
  isInternalServiceRequest,
  requireAuth,
  isAuthFailure,
} from "@/lib/security/require-auth";
import { hasAdministrationRole } from "@/lib/security/admin-authorization";
import { lookupMarketplaceAccount } from "@/lib/security/tenant-membership";
import {
  isCommercialContinuityCronRequest,
  tryResolveInternalApiSecret,
} from "@/lib/security/secrets";
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
 * Browser callers require an authenticated session and explicit account scope.
 * Invokes Orders/Sales/Finance via existing sync services.
 *
 * Scheduled cron runs a **bounded blocking tick** (≤ maxDuration − buffer).
 * Durable retry/backoff (`next_retry_at`) handles follow-up attempts hourly.
 */
async function handleTick(request: Request, opts: { force: boolean }) {
  const url = new URL(request.url);
  const rawAccountId = url.searchParams.get("marketplaceAccountId");
  if (url.searchParams.has("marketplaceAccountId") && !rawAccountId?.trim()) {
    return NextResponse.json({ error: "marketplaceAccountId is required" }, { status: 400 });
  }
  const accountId = rawAccountId?.trim() ?? undefined;
  const force = opts.force || url.searchParams.get("force") === "1";

  const internal = isInternalServiceRequest(request);
  const cron = isCommercialContinuityCronRequest(request);
  if (internal || cron) {
    if (accountId && !(await lookupMarketplaceAccount(accountId))) {
      return authForbiddenResponse("Marketplace account not found or not permitted.", "AUTHZ_ACCOUNT_FORBIDDEN");
    }
  } else {
    const user = await requireAuth(request);
    if (isAuthFailure(user)) return user;
    if (!accountId) {
      return NextResponse.json({ error: "marketplaceAccountId is required" }, { status: 400 });
    }
    if (hasAdministrationRole(user)) {
      if (!(await lookupMarketplaceAccount(accountId))) {
        return authForbiddenResponse("Marketplace account not found or not permitted.", "AUTHZ_ACCOUNT_FORBIDDEN");
      }
    } else {
      const authz = await authorize(request, { marketplaceAccountId: accountId });
      if (isAuthzFailure(authz)) return authz;
    }
  }

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

  if (body.marketplaceAccountId !== undefined) {
    if (typeof body.marketplaceAccountId !== "string" || !body.marketplaceAccountId.trim()) {
      return NextResponse.json({ error: "Invalid marketplaceAccountId" }, { status: 400 });
    }
    const url = new URL(request.url);
    url.searchParams.set("marketplaceAccountId", body.marketplaceAccountId.trim());
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
