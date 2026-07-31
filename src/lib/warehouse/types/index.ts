/**
 * Sprint 10.1 — Warehouse platform core types.
 * Matches HISTORICAL_DATA_WAREHOUSE_PLATFORM.md — no sync execution.
 */

export const WAREHOUSE_MARKETPLACES = [
  "wildberries",
  "ozon",
  "lamoda",
  "shopify",
] as const;

export type WarehouseMarketplaceType = (typeof WAREHOUSE_MARKETPLACES)[number];

/** Canonical sync entities (adapter + checkpoint surface). */
export const WAREHOUSE_PLATFORM_ENTITIES = [
  "products",
  "orders",
  "sales",
  "finance",
  "stocks",
  "prices",
  "inventory",
] as const;

export type WarehousePlatformEntity = (typeof WAREHOUSE_PLATFORM_ENTITIES)[number];

export const WAREHOUSE_SYNC_MODES = ["historical_backfill", "incremental"] as const;
export type WarehouseSyncMode = (typeof WAREHOUSE_SYNC_MODES)[number];

export const WAREHOUSE_CHECKPOINT_STATUSES = [
  "idle",
  "running",
  "paused",
  "failed",
  "complete",
] as const;
export type WarehouseCheckpointStatus = (typeof WAREHOUSE_CHECKPOINT_STATUSES)[number];

export const WAREHOUSE_SESSION_STATUSES = [
  "pending",
  "running",
  "success",
  "partial",
  "failed",
  "cancelled",
] as const;
export type WarehouseSessionStatus = (typeof WAREHOUSE_SESSION_STATUSES)[number];

export const WAREHOUSE_TRIGGER_SOURCES = [
  "manual",
  "lifecycle",
  "scheduled",
  "recover",
  "replay",
] as const;
export type WarehouseTriggerSource = (typeof WAREHOUSE_TRIGGER_SOURCES)[number];

export const WAREHOUSE_LAYERS = ["raw", "normalized", "analytics", "application"] as const;
export type WarehouseLayer = (typeof WAREHOUSE_LAYERS)[number];

/**
 * Checkpoint key = marketplace + company + account + entity + mode (+ optional shard).
 */
export type WarehouseCheckpointKey = {
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
  entity: WarehousePlatformEntity;
  mode: WarehouseSyncMode;
  /** Optional sub-stream (e.g. finance channel). Empty string = default. */
  shard?: string;
};

export type WarehouseScope = {
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
};
