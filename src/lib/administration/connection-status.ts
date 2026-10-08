/**
 * Sprint 11.2 — Connection status display mapping (no sync logic).
 */

import type { MarketplaceAccountPublic, SyncLifecycleStatus } from "@/types/database";

export type ConnectionDisplayStatus =
  | "connected"
  | "connecting"
  | "synchronizing"
  | "historical_backfill"
  | "incremental"
  | "warning"
  | "disconnected"
  | "failed";

export const CONNECTION_STATUS_LABEL: Record<ConnectionDisplayStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  synchronizing: "Synchronizing",
  historical_backfill: "Historical Backfill",
  incremental: "Incremental",
  warning: "Warning",
  disconnected: "Disconnected",
  failed: "Failed",
};

const HISTORICAL: SyncLifecycleStatus[] = [
  "HISTORICAL_BACKFILL_RUNNING",
  "HISTORICAL_BACKFILL_VERIFYING",
];

export function resolveConnectionDisplayStatus(
  account: MarketplaceAccountPublic
): ConnectionDisplayStatus {
  if (!account.is_active) return "disconnected";

  const life = account.sync_lifecycle_status;
  if (life === "FAILED") return "failed";
  if (life && HISTORICAL.includes(life)) return "historical_backfill";
  if (life === "INCREMENTAL_SYNC_ACTIVE") return "incremental";
  if (life === "PARTIAL" || life === "RECOVERING") return "warning";
  if (life === "NEW_ACCOUNT" || life === "ACCOUNT_VERIFICATION") return "connecting";

  if (account.last_sync_status === "running") return "synchronizing";
  if (account.last_sync_status === "failed") return "failed";
  if (account.last_sync_status === "warning" || account.last_sync_status === "partial") {
    return "warning";
  }

  if (life === "HEALTHY" || life === "HISTORICAL_BACKFILL_COMPLETE") return "connected";
  if (account.has_api_key) return "connected";
  return "connecting";
}

export type WarehouseHealthDisplay =
  | "healthy"
  | "warning"
  | "failed"
  | "syncing"
  | "unknown";

export function resolveCompanyWarehouseHealth(
  accounts: MarketplaceAccountPublic[]
): WarehouseHealthDisplay {
  const active = accounts.filter((a) => a.is_active);
  if (!active.length) return "unknown";

  const statuses = active.map(resolveConnectionDisplayStatus);
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "warning")) return "warning";
  if (
    statuses.some(
      (s) =>
        s === "synchronizing" ||
        s === "historical_backfill" ||
        s === "incremental" ||
        s === "connecting"
    )
  ) {
    return "syncing";
  }
  if (statuses.every((s) => s === "connected" || s === "disconnected")) {
    return statuses.some((s) => s === "connected") ? "healthy" : "unknown";
  }
  return "unknown";
}

export function latestSuccessfulSyncAt(
  accounts: MarketplaceAccountPublic[]
): string | null {
  let latest: string | null = null;
  for (const account of accounts) {
    const at = account.last_successful_sync_at;
    if (!at) continue;
    if (!latest || at > latest) latest = at;
  }
  return latest;
}
