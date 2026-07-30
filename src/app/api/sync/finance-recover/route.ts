import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  runBlockingDashboardSync,
  scheduleBackgroundDashboardSync,
  SyncAlreadyRunningError,
} from "@/services/sync-job-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Finance Sync V2 recovery — forces finance lookback re-download.
 * POST { marketplaceAccountId, blocking?: boolean }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authz = await authorizeRequestScope(request, {
      body,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      marketplaceAccountId,
      dateFrom: today,
      dateTo: today,
      entities: ["finance"] as import("@/lib/wildberries/api-client").WbSyncEntity[],
      trigger: "recover" as const,
    };

    if (body.blocking === true) {
      const result = await runBlockingDashboardSync(payload);
      return NextResponse.json({
        ok: result.success,
        mode: "blocking",
        ...result,
      });
    }

    const scheduled = await scheduleBackgroundDashboardSync(payload);
    return NextResponse.json(
      {
        ok: true,
        mode: "background",
        requestId: scheduled.requestId,
        marketplaceAccountId: scheduled.marketplaceAccountId,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Finance recover failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
