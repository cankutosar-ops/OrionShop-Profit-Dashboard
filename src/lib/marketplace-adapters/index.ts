/**
 * Sprint 10.2 — Marketplace adapters entry (outside warehouse package).
 */

export {
  WildberriesMarketplaceAdapter,
  createWildberriesMarketplaceAdapter,
} from "./wildberries/warehouse-adapter";
export { WildberriesWarehouseEntityUpsert } from "./wildberries/entity-upsert";
export {
  syncWildberriesKpiSnapshots,
  testWildberriesConnection,
} from "./wildberries/kpi-snapshot-sync";
