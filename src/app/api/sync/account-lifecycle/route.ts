import { NextResponse } from "next/server";
import { after } from "next/server";
import { containmentServerAuthHeader } from "@/lib/security/containment-gate";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  getAccountLifecycleState,
  runNewAccountLifecycle,
} from "@/services/account-lifecycle-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/sync/account-lifecycle
 * Drive / resume new-account historical finance backfill → incremental activation.
 * Body: { marketplaceAccountId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const authz = await authorizeRequestScope(request, {
      body,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const marketplaceAccountId = authz.marketplaceAccountId!;

    const result = await runNewAccountLifecycle(marketplaceAccountId);

    if (result.needsContinue) {
      after(async () => {
        const base =
          process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
          (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`
            : `http://127.0.0.1:${process.env.PORT ?? "3000"}`);
        await fetch(`${base}/api/sync/account-lifecycle`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...containmentServerAuthHeader(),
          },
          body: JSON.stringify({ marketplaceAccountId }),
        }).catch((err) => {
          console.warn(
            "[account-lifecycle] continue failed:",
            err instanceof Error ? err.message : err
          );
        });
      });
    }

    const state = await getAccountLifecycleState(marketplaceAccountId);

    return NextResponse.json({
      success: result.verified || result.status === "HEALTHY",
      ...result,
      lifecycle: state
        ? {
            status: state.sync_lifecycle_status,
            from: state.finance_backfill_from,
            to: state.finance_backfill_to,
            error: state.finance_backfill_error,
            progress: state.finance_backfill_progress,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Account lifecycle failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, {
    requireMarketplaceAccount: true,
  });
  if (isAuthzFailure(authz)) return authz;

  const marketplaceAccountId = authz.marketplaceAccountId!;
  const state = await getAccountLifecycleState(marketplaceAccountId);
  if (!state) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  return NextResponse.json({
    marketplaceAccountId,
    schemaAvailable: state.schemaAvailable,
    status: state.sync_lifecycle_status,
    from: state.finance_backfill_from,
    to: state.finance_backfill_to,
    strategy: state.finance_backfill_strategy,
    startedAt: state.finance_backfill_started_at,
    completedAt: state.finance_backfill_completed_at,
    verifiedAt: state.finance_backfill_verified_at,
    error: state.finance_backfill_error,
    progress: state.finance_backfill_progress,
  });
}
