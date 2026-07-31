/**
 * Sprint 10.1 foundation + Sprint 10.2 Historical Backfill + Sprint 10.3 Incremental Sync.
 * Marketplace HTTP stays outside this package (adapters in marketplace-adapters/).
 */

export * from "@/lib/warehouse/types";
export * from "@/lib/warehouse/adapters/marketplace-adapter";
export {
  InMemoryMarketplaceAdapterRegistry,
  marketplaceAdapterRegistry,
} from "@/lib/warehouse/adapters/registry";
export * from "@/lib/warehouse/checkpoints/types";
export { WarehouseCheckpointService } from "@/lib/warehouse/checkpoints/checkpoint-service";
export * from "@/lib/warehouse/sessions/types";
export { WarehouseSyncSessionService } from "@/lib/warehouse/sessions/session-service";
export * from "@/lib/warehouse/metadata/catalog";
export * from "@/lib/warehouse/repositories/contracts";
export { createWarehouseRepositories } from "@/lib/warehouse/repositories";
export {
  InMemoryWarehouseCheckpointRepository,
  InMemoryWarehouseSyncSessionRepository,
  InMemoryWarehouseMetadataRepository,
  InMemoryWarehouseRawMetadataRepository,
} from "@/lib/warehouse/repositories/memory";
export {
  WAREHOUSE_FOUNDATION_ALLOWS_MARKETPLACE_HTTP,
  WAREHOUSE_FOUNDATION_ALLOWS_SYNC_EXECUTION,
  WAREHOUSE_ALLOWS_HISTORICAL_BACKFILL,
  WAREHOUSE_ALLOWS_INCREMENTAL_SYNC,
  WAREHOUSE_ALLOWS_OPS_SCHEDULER,
  assertWarehouseFoundationOnly,
  assertIncrementalSyncNotEnabled,
} from "@/lib/warehouse/utils/foundation-guards";
export * from "@/lib/warehouse/backfill";
export * from "@/lib/warehouse/incremental";
export * from "@/lib/warehouse/ops";
export * from "@/lib/warehouse/snapshots";
