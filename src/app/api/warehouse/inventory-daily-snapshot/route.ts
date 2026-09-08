import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  runInventorySnapshotContinuityForAccount,
  runInventorySnapshotContinuityForAllAccounts,
} from "@/services/inventory-snapshot-continuity-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sprint 10.7 — Historical Inventory Continuity.
 *
 * POST { marketplaceAccountId?: string, snapshotDate?: string, allAccounts?: boolean }
 * Runs capture + gap recovery + retention purge (idempotent).
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
      const results = await runInventorySnapshotContinuityForAllAccounts({
        snapshotDate: body.snapshotDate,
        trigger: "manual",
      });
      return NextResponse.json({
        ok: results.every(
          (r) => r.capture.status === "success" || r.capture.status === "skipped"
        ),
        results,
      });
    }

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const result = await runInventorySnapshotContinuityForAccount(marketplaceAccountId, {
      snapshotDate: body.snapshotDate,
      trigger: "manual",
    });

    return NextResponse.json({
      ok: result.capture.status === "success" || result.capture.status === "skipped",
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

/** GET ?marketplaceAccountId= | all=1 — cron-friendly continuity tick. */
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
      const results = await runInventorySnapshotContinuityForAllAccounts({
        snapshotDate,
        trigger: "scheduled",
      });
      return NextResponse.json({ ok: true, results });
    }

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const result = await runInventorySnapshotContinuityForAccount(marketplaceAccountId, {
      snapshotDate,
      trigger: "scheduled",
    });
    return NextResponse.json({
      ok: result.capture.status === "success",
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
