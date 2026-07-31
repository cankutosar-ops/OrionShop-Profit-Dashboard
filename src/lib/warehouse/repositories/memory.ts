/**
 * Sprint 10.1 — In-memory repositories for compile/unit validation without DB.
 */

import type {
  InsertWarehouseRawIntakeMetaInput,
  WarehouseCheckpointRepository,
  WarehouseEntityCatalogEntry,
  WarehouseLayerRegistryEntry,
  WarehouseMetadataRepository,
  WarehouseRawIntakeMetaRecord,
  WarehouseRawMetadataRepository,
  WarehouseSyncSessionRepository,
} from "@/lib/warehouse/repositories/contracts";
import type { WarehouseCheckpointKey } from "@/lib/warehouse/types";
import {
  formatCheckpointKey,
  normalizeCheckpointShard,
  type UpsertWarehouseCheckpointInput,
  type WarehouseCheckpointRecord,
} from "@/lib/warehouse/checkpoints/types";
import type {
  CreateWarehouseSyncSessionInput,
  UpdateWarehouseSyncSessionInput,
  WarehouseSyncSessionRecord,
} from "@/lib/warehouse/sessions/types";
import {
  WAREHOUSE_ENTITY_DEFINITIONS,
  WAREHOUSE_LAYER_DEFINITIONS,
} from "@/lib/warehouse/metadata/catalog";
import { listWarehouseLayers, listWarehousePlatformEntities } from "@/lib/warehouse/metadata/catalog";

function nowIso(): string {
  return new Date().toISOString();
}

export class InMemoryWarehouseCheckpointRepository implements WarehouseCheckpointRepository {
  private readonly rows = new Map<string, WarehouseCheckpointRecord>();
  private seq = 1;

  async get(key: WarehouseCheckpointKey): Promise<WarehouseCheckpointRecord | null> {
    return this.rows.get(formatCheckpointKey(key)) ?? null;
  }

  async listByAccount(marketplaceAccountId: string): Promise<WarehouseCheckpointRecord[]> {
    return [...this.rows.values()].filter(
      (row) => row.marketplaceAccountId === String(marketplaceAccountId)
    );
  }

  async upsert(input: UpsertWarehouseCheckpointInput): Promise<WarehouseCheckpointRecord> {
    const keyStr = formatCheckpointKey(input.key);
    const existing = this.rows.get(keyStr);
    const stamp = nowIso();
    const next: WarehouseCheckpointRecord = {
      id: existing?.id ?? String(this.seq++),
      marketplaceType: input.key.marketplaceType,
      companyId: String(input.key.companyId),
      marketplaceAccountId: String(input.key.marketplaceAccountId),
      entity: input.key.entity,
      mode: input.key.mode,
      shard: normalizeCheckpointShard(input.key.shard),
      cursor: input.cursor !== undefined ? input.cursor : (existing?.cursor ?? null),
      windowStart:
        input.windowStart !== undefined ? input.windowStart : (existing?.windowStart ?? null),
      windowEnd: input.windowEnd !== undefined ? input.windowEnd : (existing?.windowEnd ?? null),
      status: input.status ?? existing?.status ?? "idle",
      progress: input.progress ?? existing?.progress ?? {},
      retryCount: input.retryCount ?? existing?.retryCount ?? 0,
      lastSuccessfulSyncAt:
        input.lastSuccessfulSyncAt !== undefined
          ? input.lastSuccessfulSyncAt
          : (existing?.lastSuccessfulSyncAt ?? null),
      lastAttemptedSyncAt:
        input.lastAttemptedSyncAt !== undefined
          ? input.lastAttemptedSyncAt
          : (existing?.lastAttemptedSyncAt ?? null),
      leaseOwner:
        input.leaseOwner !== undefined ? input.leaseOwner : (existing?.leaseOwner ?? null),
      leaseUntil:
        input.leaseUntil !== undefined ? input.leaseUntil : (existing?.leaseUntil ?? null),
      errorCode: input.errorCode !== undefined ? input.errorCode : (existing?.errorCode ?? null),
      errorMessage:
        input.errorMessage !== undefined ? input.errorMessage : (existing?.errorMessage ?? null),
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    };
    this.rows.set(keyStr, next);
    return next;
  }
}

export class InMemoryWarehouseSyncSessionRepository implements WarehouseSyncSessionRepository {
  private readonly rows = new Map<string, WarehouseSyncSessionRecord>();

  async getById(id: string): Promise<WarehouseSyncSessionRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async listByAccount(
    marketplaceAccountId: string,
    limit = 50
  ): Promise<WarehouseSyncSessionRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.marketplaceAccountId === String(marketplaceAccountId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async create(input: CreateWarehouseSyncSessionInput): Promise<WarehouseSyncSessionRecord> {
    const stamp = nowIso();
    const row: WarehouseSyncSessionRecord = {
      id: crypto.randomUUID(),
      marketplaceType: input.marketplaceType,
      companyId: String(input.companyId),
      marketplaceAccountId: String(input.marketplaceAccountId),
      entity: input.entity,
      mode: input.mode,
      triggerSource: input.triggerSource ?? "manual",
      status: "pending",
      startedAt: null,
      finishedAt: null,
      checkpointId: input.checkpointId ?? null,
      statistics: {},
      errorCode: null,
      errorMessage: null,
      meta: input.meta ?? {},
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async update(
    id: string,
    patch: UpdateWarehouseSyncSessionInput
  ): Promise<WarehouseSyncSessionRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new Error(`Session not found: ${id}`);
    const next: WarehouseSyncSessionRecord = {
      ...existing,
      status: patch.status ?? existing.status,
      startedAt: patch.startedAt !== undefined ? patch.startedAt : existing.startedAt,
      finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : existing.finishedAt,
      checkpointId:
        patch.checkpointId !== undefined ? patch.checkpointId : existing.checkpointId,
      statistics: patch.statistics ?? existing.statistics,
      errorCode: patch.errorCode !== undefined ? patch.errorCode : existing.errorCode,
      errorMessage:
        patch.errorMessage !== undefined ? patch.errorMessage : existing.errorMessage,
      meta: patch.meta ?? existing.meta,
      updatedAt: nowIso(),
    };
    this.rows.set(id, next);
    return next;
  }
}

export class InMemoryWarehouseMetadataRepository implements WarehouseMetadataRepository {
  async listEntities(): Promise<WarehouseEntityCatalogEntry[]> {
    return listWarehousePlatformEntities().map((entity) => {
      const def = WAREHOUSE_ENTITY_DEFINITIONS[entity];
      return {
        entity,
        label: def.label,
        layer: def.layer,
        description: def.label,
        isRequiredForHealthy: def.requiredForHealthy,
      };
    });
  }

  async listLayers(): Promise<WarehouseLayerRegistryEntry[]> {
    return listWarehouseLayers().map((layer) => ({
      layer,
      label: WAREHOUSE_LAYER_DEFINITIONS[layer].label,
      description: WAREHOUSE_LAYER_DEFINITIONS[layer].description,
    }));
  }
}

export class InMemoryWarehouseRawMetadataRepository implements WarehouseRawMetadataRepository {
  private readonly rows: WarehouseRawIntakeMetaRecord[] = [];

  async insert(input: InsertWarehouseRawIntakeMetaInput): Promise<WarehouseRawIntakeMetaRecord> {
    const row: WarehouseRawIntakeMetaRecord = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId ?? null,
      marketplaceType: input.marketplaceType,
      companyId: String(input.companyId),
      marketplaceAccountId: String(input.marketplaceAccountId),
      entity: input.entity,
      endpointFamily: input.endpointFamily ?? "",
      requestFingerprint: input.requestFingerprint ?? null,
      windowFrom: input.windowFrom ?? null,
      windowTo: input.windowTo ?? null,
      cursorBefore: input.cursorBefore ?? null,
      cursorAfter: input.cursorAfter ?? null,
      httpStatusClass: input.httpStatusClass ?? null,
      payloadDigest: input.payloadDigest ?? null,
      recordsRead: input.recordsRead ?? 0,
      meta: input.meta ?? {},
      createdAt: nowIso(),
    };
    this.rows.unshift(row);
    return row;
  }

  async listByAccount(
    marketplaceAccountId: string,
    limit = 50
  ): Promise<WarehouseRawIntakeMetaRecord[]> {
    return this.rows
      .filter((row) => row.marketplaceAccountId === String(marketplaceAccountId))
      .slice(0, limit);
  }
}
