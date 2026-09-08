/**
 * Sprint 10.7 — Historical Inventory Continuity.
 *
 * Guarantees daily inventory snapshots from Warehouse activation date → today,
 * independent of Dashboard Sync. Reuses captureDailyInventorySnapshot (no new engine).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { filterOperationalMarketplaceAccounts } from "@/lib/marketplace-account-visibility";
import { syncLog } from "@/lib/wildberries/sync-log";
import { getDataRetentionPreferences } from "@/lib/platform-config/provider";
import {
  captureDailyInventorySnapshot,
  detectMissingSnapshotDates,
  purgeExpiredInventorySnapshots,
  resolveInventorySnapshotActivationDate,
  type DailyInventorySnapshotResult,
  type InventoryRetentionPurgeAuthorization,
} from "@/services/inventory-daily-snapshot-service";
import { updateWarehouseEntityState } from "@/services/warehouse-entity-sync-state-service";

export type InventoryContinuityResult = {
  marketplaceAccountId: string;
  activationDate: string;
  capture: DailyInventorySnapshotResult;
  missingBefore: string[];
  missingAfter: string[];
  gapsFilled: string[];
  purgedRows: number;
  retentionDays: number;
  continuousFromActivation: boolean;
};

const DEFAULT_RETENTION_DAYS = 90;

/** Injection seam, mirroring `InventoryTaskDeps`. Tests supply fakes. */
export type InventoryContinuityDeps = {
  resolveActivationDate: typeof resolveInventorySnapshotActivationDate;
  detectMissing: typeof detectMissingSnapshotDates;
  capture: typeof captureDailyInventorySnapshot;
  purge: typeof purgeExpiredInventorySnapshots;
  resolveRetentionDays: typeof getInventorySnapshotRetentionDays;
};

/**
 * One continuity pass for an account:
 * 1) Capture today (live Analytics — all warehouse locations including FBS peers)
 * 2) Recover past gaps from activation → today when archives allow
 *
 * Retention purge is NOT part of this pass. It only runs when the caller passes
 * `retentionPurge`, which no automatic path does — see the authorization type.
 */
export async function runInventorySnapshotContinuityForAccount(
  marketplaceAccountId: string,
  options?: {
    trigger?: "manual" | "lifecycle" | "scheduled" | "recover";
    snapshotDate?: string;
    retentionDays?: number;
    /** Explicit opt-in for the destructive purge; omitted ⇒ nothing is deleted. */
    retentionPurge?: InventoryRetentionPurgeAuthorization;
    deps?: Partial<InventoryContinuityDeps>;
  }
): Promise<InventoryContinuityResult> {
  const resolveActivationDate =
    options?.deps?.resolveActivationDate ?? resolveInventorySnapshotActivationDate;
  const detectMissing = options?.deps?.detectMissing ?? detectMissingSnapshotDates;
  const captureSnapshot = options?.deps?.capture ?? captureDailyInventorySnapshot;
  const purge = options?.deps?.purge ?? purgeExpiredInventorySnapshots;
  const resolveRetentionDays =
    options?.deps?.resolveRetentionDays ?? getInventorySnapshotRetentionDays;
  const trigger = options?.trigger ?? "scheduled";
  const activationDate = await resolveActivationDate(marketplaceAccountId);
  const missingBefore = await detectMissing(marketplaceAccountId, {
    fromDate: activationDate,
  });

  const capture = await captureSnapshot({
    marketplaceAccountId,
    snapshotDate: options?.snapshotDate,
    trigger,
    fillGaps: true,
    activationDate,
  });

  const retentionDays = options?.retentionDays ?? (await resolveRetentionDays());

  // Reporting-only unless the caller explicitly authorized a destructive run.
  const purgedRows = options?.retentionPurge
    ? await purge(marketplaceAccountId, retentionDays, options.retentionPurge)
    : 0;

  const missingAfter = await detectMissing(marketplaceAccountId, {
    fromDate: activationDate,
  });

  await updateWarehouseEntityState({
    marketplaceAccountId,
    entity: "inventory",
    progress: {
      activationDate,
      missingDates: missingAfter,
      continuity: {
        lastTickAt: new Date().toISOString(),
        continuousFromActivation: missingAfter.length === 0,
        retentionDays,
        purgedRows,
      },
    },
  }).catch(() => null);

  syncLog("inventory-continuity", "tick complete", {
    marketplaceAccountId,
    activationDate,
    captureStatus: capture.status,
    missingBefore: missingBefore.length,
    missingAfter: missingAfter.length,
    gapsFilled: capture.gapsFilled,
    purgedRows,
    retentionDays,
  });

  return {
    marketplaceAccountId,
    activationDate,
    capture,
    missingBefore,
    missingAfter,
    gapsFilled: capture.gapsFilled,
    purgedRows,
    retentionDays,
    continuousFromActivation: missingAfter.length === 0,
  };
}

export async function runInventorySnapshotContinuityForAllAccounts(options?: {
  trigger?: "manual" | "scheduled" | "recover";
  snapshotDate?: string;
}): Promise<InventoryContinuityResult[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marketplace_accounts")
    .select("id, account_name, marketplace, is_active")
    .eq("marketplace", "wildberries")
    .eq("is_active", true)
    .order("id");

  if (error) throw new Error(error.message);
  const accounts = filterOperationalMarketplaceAccounts(data ?? []);
  const results: InventoryContinuityResult[] = [];

  for (const account of accounts) {
    try {
      results.push(
        await runInventorySnapshotContinuityForAccount(String(account.id), {
          trigger: options?.trigger ?? "scheduled",
          snapshotDate: options?.snapshotDate,
        })
      );
    } catch (err) {
      syncLog("inventory-continuity", "account tick failed", {
        marketplaceAccountId: account.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export async function getInventorySnapshotRetentionDays(): Promise<number> {
  try {
    const prefs = await getDataRetentionPreferences();
    const n = Number(prefs.warehouseHistoryDays);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  } catch {
    /* defaults */
  }
  return DEFAULT_RETENTION_DAYS;
}

