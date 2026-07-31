/**
 * Sprint 10.1 — Repository contracts (dependency inversion).
 * No Financial Engine logic. No marketplace API calls.
 */

import type { WarehouseCheckpointKey } from "@/lib/warehouse/types";
import type {
  UpsertWarehouseCheckpointInput,
  WarehouseCheckpointRecord,
} from "@/lib/warehouse/checkpoints/types";
import type {
  CreateWarehouseSyncSessionInput,
  UpdateWarehouseSyncSessionInput,
  WarehouseSyncSessionRecord,
} from "@/lib/warehouse/sessions/types";
import type { WarehousePlatformEntity, WarehouseLayer } from "@/lib/warehouse/types";

export type WarehouseEntityCatalogEntry = {
  entity: WarehousePlatformEntity;
  label: string;
  layer: WarehouseLayer;
  description: string;
  isRequiredForHealthy: boolean;
};

export type WarehouseLayerRegistryEntry = {
  layer: WarehouseLayer;
  label: string;
  description: string;
};

export type WarehouseRawIntakeMetaRecord = {
  id: string;
  sessionId: string | null;
  marketplaceType: string;
  companyId: string;
  marketplaceAccountId: string;
  entity: WarehousePlatformEntity;
  endpointFamily: string;
  requestFingerprint: string | null;
  windowFrom: string | null;
  windowTo: string | null;
  cursorBefore: string | null;
  cursorAfter: string | null;
  httpStatusClass: string | null;
  payloadDigest: string | null;
  recordsRead: number;
  meta: Record<string, unknown>;
  createdAt: string;
};

export type InsertWarehouseRawIntakeMetaInput = {
  sessionId?: string | null;
  marketplaceType: string;
  companyId: string;
  marketplaceAccountId: string;
  entity: WarehousePlatformEntity;
  endpointFamily?: string;
  requestFingerprint?: string | null;
  windowFrom?: string | null;
  windowTo?: string | null;
  cursorBefore?: string | null;
  cursorAfter?: string | null;
  httpStatusClass?: string | null;
  payloadDigest?: string | null;
  recordsRead?: number;
  meta?: Record<string, unknown>;
};

/** Checkpoint persistence. */
export interface WarehouseCheckpointRepository {
  get(key: WarehouseCheckpointKey): Promise<WarehouseCheckpointRecord | null>;
  listByAccount(marketplaceAccountId: string): Promise<WarehouseCheckpointRecord[]>;
  upsert(input: UpsertWarehouseCheckpointInput): Promise<WarehouseCheckpointRecord>;
}

/** Sync session persistence. */
export interface WarehouseSyncSessionRepository {
  getById(id: string): Promise<WarehouseSyncSessionRecord | null>;
  listByAccount(
    marketplaceAccountId: string,
    limit?: number
  ): Promise<WarehouseSyncSessionRecord[]>;
  create(input: CreateWarehouseSyncSessionInput): Promise<WarehouseSyncSessionRecord>;
  update(
    id: string,
    patch: UpdateWarehouseSyncSessionInput
  ): Promise<WarehouseSyncSessionRecord>;
}

/** Entity / layer metadata. */
export interface WarehouseMetadataRepository {
  listEntities(): Promise<WarehouseEntityCatalogEntry[]>;
  listLayers(): Promise<WarehouseLayerRegistryEntry[]>;
}

/** Raw layer intake metadata (no payload bodies in 10.1). */
export interface WarehouseRawMetadataRepository {
  insert(input: InsertWarehouseRawIntakeMetaInput): Promise<WarehouseRawIntakeMetaRecord>;
  listByAccount(
    marketplaceAccountId: string,
    limit?: number
  ): Promise<WarehouseRawIntakeMetaRecord[]>;
}

/**
 * Generic normalized-layer access contract for future entity stores.
 * Sprint 10.1: interface only — no entity upsert implementations.
 */
export interface WarehouseEntityRepository<TRecord extends { id: string }> {
  readById(scopeAccountId: string, id: string): Promise<TRecord | null>;
  upsertMany(scopeAccountId: string, rows: TRecord[]): Promise<{ upserted: number }>;
}

export type WarehouseRepositories = {
  checkpoints: WarehouseCheckpointRepository;
  sessions: WarehouseSyncSessionRepository;
  metadata: WarehouseMetadataRepository;
  rawMetadata: WarehouseRawMetadataRepository;
};
