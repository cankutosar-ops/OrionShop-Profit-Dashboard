/**
 * Sprint 11.3 — Warehouse Control Center payload types (client-safe).
 */

import type { WarehouseCheckpointRecord } from "@/lib/warehouse/checkpoints/types";
import type { WarehouseSyncSessionRecord } from "@/lib/warehouse/sessions/types";
import type { WarehouseAdminStatusBundle } from "@/lib/warehouse/ops";

export type PlatformSubsystemHealth = {
  key: "warehouse" | "scheduler" | "queue" | "database" | "marketplace";
  label: string;
  state: "healthy" | "warning" | "degraded" | "failed" | "unknown";
  detail: string;
};

export type WarehouseControlCenterPayload = WarehouseAdminStatusBundle & {
  checkpoints: WarehouseCheckpointRecord[];
  sessions: WarehouseSyncSessionRecord[];
  platformHealth: PlatformSubsystemHealth[];
  overallState: "healthy" | "warning" | "degraded" | "failed" | "unknown";
  account: {
    id: string;
    companyId: string;
    marketplace: string;
    accountName: string;
  };
};
