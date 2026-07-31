import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  getIncrementalSyncStatus,
  runIncrementalSync,
  runScheduledIncrementalSync,
} from "@/services/incremental-sync-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/warehouse/incremental-sync?marketplaceAccountId=
 * Incremental checkpoints + historical eligibility.
 *
 * POST {
 *   marketplaceAccountId,
 *   trigger?: "manual" | "api" | "scheduled",
 *   lookbackHours?, simulate?, seedHistoricalComplete?
 * }
 *
 * Blocked unless Historical Backfill is complete (incremental eligible).
 * Scheduler itself is not implemented — `scheduled` is future-ready only.
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  try {
    const status = await getIncrementalSyncStatus(authz.marketplaceAccountId!);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load incremental sync status",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      marketplaceAccountId?: string;
      trigger?: "manual" | "api" | "scheduled";
      lookbackHours?: number;
      simulate?: boolean;
      seedHistoricalComplete?: boolean;
      companyId?: string;
    };

    const authz = await authorizeRequestScope(request, {
      body,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const trigger = body.trigger ?? "api";

    const result =
      trigger === "scheduled"
        ? await runScheduledIncrementalSync(marketplaceAccountId, {
            lookbackHours: body.lookbackHours,
            simulate: body.simulate,
            seedHistoricalComplete: body.seedHistoricalComplete,
            companyId: body.companyId,
          })
        : await runIncrementalSync({
            marketplaceAccountId,
            trigger,
            lookbackHours: body.lookbackHours,
            simulate: body.simulate,
            seedHistoricalComplete: body.seedHistoricalComplete,
            companyId: body.companyId,
          });

    const ok = result.status === "success" || result.status === "partial";
    return NextResponse.json({
      ok: result.status === "blocked" ? false : ok,
      blocked: result.status === "blocked",
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Incremental sync failed",
      },
      { status: 500 }
    );
  }
}
