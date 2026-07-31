import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  getHistoricalBackfillStatus,
  runHistoricalBackfill,
  triggerRebuildHistory,
} from "@/services/historical-backfill-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/warehouse/historical-backfill?marketplaceAccountId=
 * Observable historical backfill checkpoints + incremental eligibility.
 *
 * POST {
 *   marketplaceAccountId,
 *   trigger?: "lifecycle" | "rebuild_history" | "manual",
 *   historyFrom?, historyTo?, forceRestart?, simulate?, windowDays?
 * }
 *
 * Historical First → Verification → Incremental eligibility (no incremental sync).
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  try {
    const status = await getHistoricalBackfillStatus(authz.marketplaceAccountId!);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load historical backfill status",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      marketplaceAccountId?: string;
      trigger?: "lifecycle" | "rebuild_history" | "manual";
      historyFrom?: string;
      historyTo?: string;
      forceRestart?: boolean;
      simulate?: boolean;
      windowDays?: number;
      companyId?: string;
    };

    const authz = await authorizeRequestScope(request, {
      body,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const trigger = body.trigger ?? "lifecycle";

    const result =
      trigger === "rebuild_history"
        ? await triggerRebuildHistory(marketplaceAccountId, {
            historyFrom: body.historyFrom,
            historyTo: body.historyTo,
            simulate: body.simulate,
            windowDays: body.windowDays,
            companyId: body.companyId,
          })
        : await runHistoricalBackfill({
            marketplaceAccountId,
            trigger,
            historyFrom: body.historyFrom,
            historyTo: body.historyTo,
            forceRestart: body.forceRestart,
            simulate: body.simulate,
            windowDays: body.windowDays,
            companyId: body.companyId,
          });

    return NextResponse.json({
      ok: result.status === "success",
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Historical backfill failed",
      },
      { status: 500 }
    );
  }
}
