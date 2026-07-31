/**
 * Sprint 10.1 — Checkpoint domain types + key helpers.
 */

import type {
  WarehouseCheckpointKey,
  WarehouseCheckpointStatus,
  WarehouseMarketplaceType,
  WarehousePlatformEntity,
  WarehouseSyncMode,
} from "@/lib/warehouse/types";

export type WarehouseCheckpointRecord = {
  id: string;
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
  entity: WarehousePlatformEntity;
  mode: WarehouseSyncMode;
  shard: string;
  cursor: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  status: WarehouseCheckpointStatus;
  progress: Record<string, unknown>;
  retryCount: number;
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  leaseOwner: string | null;
  leaseUntil: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertWarehouseCheckpointInput = {
  key: WarehouseCheckpointKey;
  cursor?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  status?: WarehouseCheckpointStatus;
  progress?: Record<string, unknown>;
  retryCount?: number;
  lastSuccessfulSyncAt?: string | null;
  lastAttemptedSyncAt?: string | null;
  leaseOwner?: string | null;
  leaseUntil?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export function normalizeCheckpointShard(shard?: string | null): string {
  return (shard ?? "").trim();
}

export function checkpointKeyEquals(
  a: WarehouseCheckpointKey,
  b: WarehouseCheckpointKey
): boolean {
  return (
    a.marketplaceType === b.marketplaceType &&
    String(a.companyId) === String(b.companyId) &&
    String(a.marketplaceAccountId) === String(b.marketplaceAccountId) &&
    a.entity === b.entity &&
    a.mode === b.mode &&
    normalizeCheckpointShard(a.shard) === normalizeCheckpointShard(b.shard)
  );
}

export function formatCheckpointKey(key: WarehouseCheckpointKey): string {
  const shard = normalizeCheckpointShard(key.shard);
  return [
    key.marketplaceType,
    key.companyId,
    key.marketplaceAccountId,
    key.entity,
    key.mode,
    shard || "_",
  ].join("|");
}
