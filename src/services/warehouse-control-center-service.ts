/**
 * Sprint 11.3 — Warehouse Control Center read aggregation.
 * Operational visibility only — no sync engines, no financial math.
 */

import type { WarehouseCheckpointRecord } from "@/lib/warehouse/checkpoints/types";
import type { WarehouseSyncSessionRecord } from "@/lib/warehouse/sessions/types";
import type { WarehouseAdminStatusBundle } from "@/lib/warehouse/ops";
import type {
  PlatformSubsystemHealth,
  WarehouseControlCenterPayload,
} from "@/lib/administration/warehouse-control-types";
import { createWarehouseRepositories } from "@/lib/warehouse/repositories";
import { getWarehouseAdminBundle } from "@/services/warehouse-ops-service";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";

export type { PlatformSubsystemHealth, WarehouseControlCenterPayload };

function mapOpsHealthToOverall(
  state: string
): WarehouseControlCenterPayload["overallState"] {
  switch (state) {
    case "healthy":
      return "healthy";
    case "sync_delayed":
      return "warning";
    case "degraded":
      return "degraded";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

function buildPlatformHealth(
  bundle: WarehouseAdminStatusBundle,
  dbOk: boolean,
  marketplaceOk: boolean
): PlatformSubsystemHealth[] {
  const warehouseState = mapOpsHealthToOverall(bundle.health.state);
  const disabledSchedules = bundle.warehouseStatus.schedules.filter((s) => !s.enabled).length;
  const waiting = bundle.queueStatus.waiting.length;
  const running = bundle.queueStatus.running.length;
  const openCritical = bundle.alerts.filter((a) => a.severity === "critical").length;

  return [
    {
      key: "warehouse",
      label: "Warehouse",
      state: warehouseState,
      detail: bundle.health.reason || bundle.health.state,
    },
    {
      key: "scheduler",
      label: "Scheduler",
      state:
        disabledSchedules === bundle.warehouseStatus.schedules.length &&
        bundle.warehouseStatus.schedules.length > 0
          ? "warning"
          : "healthy",
      detail:
        disabledSchedules > 0
          ? `${disabledSchedules} schedule(s) disabled`
          : "Schedules configured",
    },
    {
      key: "queue",
      label: "Queue",
      state: openCritical > 0 || waiting > 50 ? "degraded" : running > 0 ? "warning" : "healthy",
      detail: `${waiting} waiting · ${running} running`,
    },
    {
      key: "database",
      label: "Database",
      state: dbOk ? "healthy" : "failed",
      detail: dbOk ? "Checkpoint/session repositories reachable" : "Warehouse DB read failed",
    },
    {
      key: "marketplace",
      label: "Marketplace Connectivity",
      state: marketplaceOk ? "healthy" : "warning",
      detail: marketplaceOk ? "Credential configured" : "Missing or inactive credential",
    },
  ];
}

function pickOverall(
  parts: PlatformSubsystemHealth[]
): WarehouseControlCenterPayload["overallState"] {
  if (parts.some((p) => p.state === "failed")) return "failed";
  if (parts.some((p) => p.state === "degraded")) return "degraded";
  if (parts.some((p) => p.state === "warning")) return "warning";
  if (parts.every((p) => p.state === "healthy")) return "healthy";
  return "unknown";
}

export async function getWarehouseControlCenter(
  marketplaceAccountId: string,
  options?: { simulate?: boolean; companyId?: string }
): Promise<WarehouseControlCenterPayload> {
  const bundle = await getWarehouseAdminBundle(marketplaceAccountId, options);

  let checkpoints: WarehouseCheckpointRecord[] = [];
  let sessions: WarehouseSyncSessionRecord[] = [];
  let dbOk = true;

  if (!options?.simulate) {
    try {
      const repos = createWarehouseRepositories();
      checkpoints = await repos.checkpoints.listByAccount(marketplaceAccountId);
      sessions = await repos.sessions.listByAccount(marketplaceAccountId, 100);
    } catch {
      dbOk = false;
    }
  }

  let marketplaceOk = false;
  let accountMeta = {
    id: marketplaceAccountId,
    companyId: options?.companyId ?? "",
    marketplace: "wildberries",
    accountName: marketplaceAccountId,
  };

  try {
    if (!options?.simulate) {
      const account = await getMarketplaceAccountForSync(marketplaceAccountId);
      marketplaceOk = Boolean(account.apiKey?.trim());
      accountMeta = {
        id: String(marketplaceAccountId),
        companyId: String(account.company_id),
        marketplace: String(account.marketplace),
        accountName: String(account.account_name ?? marketplaceAccountId),
      };
    } else {
      marketplaceOk = true;
      accountMeta = {
        id: marketplaceAccountId,
        companyId: options.companyId ?? "1",
        marketplace: "wildberries",
        accountName: "Simulated account",
      };
    }
  } catch {
    marketplaceOk = false;
  }

  const platformHealth = buildPlatformHealth(bundle, dbOk, marketplaceOk);
  const overallState = pickOverall(platformHealth);

  return {
    ...bundle,
    checkpoints,
    sessions,
    platformHealth,
    overallState,
    account: accountMeta,
  };
}
