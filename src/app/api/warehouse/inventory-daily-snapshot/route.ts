import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  captureDailyInventorySnapshot,
  captureDailyInventorySnapshotForAllAccounts,
} from "@/services/inventory-daily-snapshot-service";
import { runWarehouseEntityIncrementalSync } from "@/services/historical-warehouse-orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sprint 11.1 — Daily inventory snapshot sync.
 *
 * POST { marketplaceAccountId?: string, snapshotDate?: string, allAccounts?: boolean }
 * Captures today's (or given) inventory into historical_inventory_snapshots.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      marketplaceAccountId?: string;
      snapshotDate?: string;
      allAccounts?: boolean;
    };

    const authz = await authorizeRequestScope(request, {
      body,
      requireMarketplaceAccount: !body.allAccounts,
      allowAllAccounts: !!body.allAccounts,
    });
    if (isAuthzFailure(authz)) return authz;

    if (body.allAccounts) {
      const results = await captureDailyInventorySnapshotForAllAccounts({
        snapshotDate: body.snapshotDate,
        trigger: "manual",
      });
      return NextResponse.json({
        ok: results.every((r) => r.status === "success" || r.status === "skipped"),
        results,
      });
    }

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const result = await runWarehouseEntityIncrementalSync({
      marketplaceAccountId,
      entity: "inventory",
      snapshotDate: body.snapshotDate,
      trigger: "manual",
    });

    return NextResponse.json({
      ok: result.status === "success" || result.status === "skipped",
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Daily inventory snapshot failed",
      },
      { status: 500 }
    );
  }
}

/** GET ?marketplaceAccountId= — capture today for one account (cron-friendly). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const snapshotDate = url.searchParams.get("snapshotDate")?.trim() || undefined;
  const all = url.searchParams.get("all") === "1";

  const authz = await authorizeRequestScope(request, {
    requireMarketplaceAccount: !all,
    allowAllAccounts: all,
  });
  if (isAuthzFailure(authz)) return authz;

  try {
    if (all) {
      const results = await captureDailyInventorySnapshotForAllAccounts({
        snapshotDate,
        trigger: "scheduled",
      });
      return NextResponse.json({ ok: true, results });
    }

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const result = await captureDailyInventorySnapshot({
      marketplaceAccountId,
      snapshotDate,
      trigger: "scheduled",
      fillGaps: true,
    });
    return NextResponse.json({ ok: result.status === "success", result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Daily inventory snapshot failed",
      },
      { status: 500 }
    );
  }
}
