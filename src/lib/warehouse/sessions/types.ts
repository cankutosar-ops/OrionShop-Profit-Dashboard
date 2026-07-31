/**
 * Sprint 10.1 — Sync session domain types.
 */

import type {
  WarehouseMarketplaceType,
  WarehousePlatformEntity,
  WarehouseSessionStatus,
  WarehouseSyncMode,
  WarehouseTriggerSource,
} from "@/lib/warehouse/types";

export type WarehouseSyncSessionStatistics = {
  recordsRead?: number;
  rowsInserted?: number;
  rowsUpdated?: number;
  rowsSkipped?: number;
  pages?: number;
  [key: string]: unknown;
};

export type WarehouseSyncSessionRecord = {
  id: string;
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
  entity: WarehousePlatformEntity;
  mode: WarehouseSyncMode;
  triggerSource: WarehouseTriggerSource;
  status: WarehouseSessionStatus;
  startedAt: string | null;
  finishedAt: string | null;
  checkpointId: string | null;
  statistics: WarehouseSyncSessionStatistics;
  errorCode: string | null;
  errorMessage: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateWarehouseSyncSessionInput = {
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
  entity: WarehousePlatformEntity;
  mode: WarehouseSyncMode;
  triggerSource?: WarehouseTriggerSource;
  checkpointId?: string | null;
  meta?: Record<string, unknown>;
};

export type UpdateWarehouseSyncSessionInput = {
  status?: WarehouseSessionStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  checkpointId?: string | null;
  statistics?: WarehouseSyncSessionStatistics;
  errorCode?: string | null;
  errorMessage?: string | null;
  meta?: Record<string, unknown>;
};
