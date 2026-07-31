/**
 * Sprint 10.1 — Static layer / entity metadata (mirrors DB catalog; no I/O).
 */

import type { WarehouseLayer, WarehousePlatformEntity } from "@/lib/warehouse/types";
import { WAREHOUSE_LAYERS, WAREHOUSE_PLATFORM_ENTITIES } from "@/lib/warehouse/types";

export const WAREHOUSE_LAYER_DEFINITIONS: Record<
  WarehouseLayer,
  { label: string; description: string }
> = {
  raw: {
    label: "Raw Layer",
    description: "Landing / intake metadata and replayable sync artifacts",
  },
  normalized: {
    label: "Normalized Layer",
    description: "Canonical tenant-scoped warehouse facts",
  },
  analytics: {
    label: "Analytics Layer",
    description: "Rebuildable derived marts and rollups",
  },
  application: {
    label: "Application Layer",
    description: "Modules that read the project database only",
  },
};

export const WAREHOUSE_ENTITY_DEFINITIONS: Record<
  WarehousePlatformEntity,
  { label: string; layer: WarehouseLayer; requiredForHealthy: boolean }
> = {
  products: { label: "Products", layer: "normalized", requiredForHealthy: true },
  orders: { label: "Orders", layer: "normalized", requiredForHealthy: true },
  sales: { label: "Sales", layer: "normalized", requiredForHealthy: true },
  finance: { label: "Finance", layer: "normalized", requiredForHealthy: true },
  stocks: { label: "Stocks", layer: "normalized", requiredForHealthy: false },
  prices: { label: "Prices", layer: "normalized", requiredForHealthy: false },
  inventory: { label: "Inventory History", layer: "normalized", requiredForHealthy: false },
};

export function listWarehouseLayers(): WarehouseLayer[] {
  return [...WAREHOUSE_LAYERS];
}

export function listWarehousePlatformEntities(): WarehousePlatformEntity[] {
  return [...WAREHOUSE_PLATFORM_ENTITIES];
}
