/**
 * Sprint 11 — Historical Data Warehouse domain registry.
 *
 * Marketplace APIs → Historical Data Warehouse → Dashboard / Reports / Analytics
 * Modules must read warehouse tables, never live marketplace APIs for reporting.
 */

export const WAREHOUSE_ENTITIES = [
  "inventory",
  "orders",
  "sales",
  "finance",
  "stocks",
] as const;

export type WarehouseEntity = (typeof WAREHOUSE_ENTITIES)[number];

export const WAREHOUSE_ENTITY_STAGES = [
  "pending",
  "historical_backfill_running",
  "verifying",
  "complete",
  "incremental_sync_active",
  "healthy",
  "failed",
] as const;

export type WarehouseEntityStage = (typeof WAREHOUSE_ENTITY_STAGES)[number];

/** Account-level lifecycle (existing). Verification is the only path to HEALTHY. */
export const WAREHOUSE_ACCOUNT_LIFECYCLE = [
  "NEW_ACCOUNT",
  "HISTORICAL_BACKFILL_RUNNING",
  "HISTORICAL_BACKFILL_VERIFYING",
  "HISTORICAL_BACKFILL_COMPLETE",
  "INCREMENTAL_SYNC_ACTIVE",
  "HEALTHY",
] as const;

export type WarehouseDomainDefinition = {
  entity: WarehouseEntity;
  label: string;
  /** Primary warehouse / operational tables this domain owns. */
  tables: string[];
  /** Historical depth strategy for backfill. */
  backfillStrategy: "daily_snapshots" | "windowed_events" | "point_in_time" | "finance_windows";
  /** True when historical backfill path is implemented in warehouse foundation. */
  historicalBackfillImplemented: boolean;
  /** True when incremental sync path is implemented. */
  incrementalSyncImplemented: boolean;
  notes: string;
};

export const WAREHOUSE_DOMAINS: Record<WarehouseEntity, WarehouseDomainDefinition> = {
  inventory: {
    entity: "inventory",
    label: "Inventory History",
    tables: ["historical_inventory_snapshots"],
    backfillStrategy: "daily_snapshots",
    historicalBackfillImplemented: true,
    incrementalSyncImplemented: true,
    notes:
      "Historical daily Warehouse+SKU+Size snapshots. Backfill from STOCK_HISTORY_DAILY_CSV archives; forward capture via Analytics wb-warehouses stock → historical_inventory_snapshots.",
  },
  orders: {
    entity: "orders",
    label: "Orders",
    tables: ["wb_orders"],
    backfillStrategy: "windowed_events",
    historicalBackfillImplemented: false,
    incrementalSyncImplemented: true,
    notes: "Operational upsert via WbSyncService.syncOrders. Warehouse windowed backfill to be wired.",
  },
  sales: {
    entity: "sales",
    label: "Sales",
    tables: ["wb_sales"],
    backfillStrategy: "windowed_events",
    historicalBackfillImplemented: false,
    incrementalSyncImplemented: true,
    notes: "Operational upsert via syncSales. Historical windows currently script-driven (FS progress).",
  },
  finance: {
    entity: "finance",
    label: "Finance",
    tables: ["wb_finance"],
    backfillStrategy: "finance_windows",
    historicalBackfillImplemented: true,
    incrementalSyncImplemented: true,
    notes:
      "Owned by account lifecycle (finance_backfill_*). Warehouse entity state mirrors lifecycle progress.",
  },
  stocks: {
    entity: "stocks",
    label: "Current Stocks",
    tables: ["wb_stock"],
    backfillStrategy: "point_in_time",
    historicalBackfillImplemented: false,
    incrementalSyncImplemented: true,
    notes:
      "Point-in-time cache (wb_stock). Historical remains live in inventory domain snapshots.",
  },
};

export function isWarehouseEntity(value: string): value is WarehouseEntity {
  return (WAREHOUSE_ENTITIES as readonly string[]).includes(value);
}

export type WarehouseEntityProgress = {
  completedWindows?: Record<string, boolean>;
  failedWindows?: Record<string, string>;
  pendingWindows?: string[];
  lastWindow?: string | null;
  strategy?: string;
  from?: string;
  to?: string;
  /** Inventory: list of snapshot dates imported. */
  snapshotDates?: string[];
  source?: string;
  [key: string]: unknown;
};

export type WarehouseEntitySyncState = {
  id: number;
  marketplace_account_id: number;
  entity: WarehouseEntity;
  stage: WarehouseEntityStage;
  progress: WarehouseEntityProgress;
  started_at: string | null;
  completed_at: string | null;
  last_successful_sync_at: string | null;
  last_failed_sync_at: string | null;
  current_dataset: string | null;
  current_page: number | null;
  error_message: string | null;
  retry_count: number;
  updated_at: string;
  created_at: string;
};

export type WarehouseImportTrigger = "manual" | "lifecycle" | "recover" | "scheduled";

export type WarehouseImportAuditStatus = "running" | "success" | "partial" | "failed";

export type WarehouseImportAudit = {
  id: string;
  marketplace_account_id: number;
  entity: WarehouseEntity;
  trigger: WarehouseImportTrigger;
  status: WarehouseImportAuditStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  current_dataset: string | null;
  current_page: number | null;
  records_read: number;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  validation_result: string | null;
  errors: unknown[];
  meta: Record<string, unknown>;
  created_at: string;
};
