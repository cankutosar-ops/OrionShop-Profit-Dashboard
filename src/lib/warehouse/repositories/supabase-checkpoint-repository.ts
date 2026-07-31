/**
 * Sprint 10.1 — Supabase checkpoint repository (metadata CRUD only).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { WarehouseCheckpointRepository } from "@/lib/warehouse/repositories/contracts";
import type { WarehouseCheckpointKey } from "@/lib/warehouse/types";
import {
  normalizeCheckpointShard,
  type UpsertWarehouseCheckpointInput,
  type WarehouseCheckpointRecord,
} from "@/lib/warehouse/checkpoints/types";
import type {
  WarehouseCheckpointStatus,
  WarehouseMarketplaceType,
  WarehousePlatformEntity,
  WarehouseSyncMode,
} from "@/lib/warehouse/types";

type CheckpointRow = {
  id: number;
  marketplace_type: string;
  company_id: number;
  marketplace_account_id: number;
  entity: string;
  mode: string;
  shard: string;
  cursor: string | null;
  window_start: string | null;
  window_end: string | null;
  status: string;
  progress: Record<string, unknown>;
  retry_count: number;
  last_successful_sync_at: string | null;
  last_attempted_sync_at: string | null;
  lease_owner: string | null;
  lease_until: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: CheckpointRow): WarehouseCheckpointRecord {
  return {
    id: String(row.id),
    marketplaceType: row.marketplace_type as WarehouseMarketplaceType,
    companyId: String(row.company_id),
    marketplaceAccountId: String(row.marketplace_account_id),
    entity: row.entity as WarehousePlatformEntity,
    mode: row.mode as WarehouseSyncMode,
    shard: row.shard ?? "",
    cursor: row.cursor,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    status: row.status as WarehouseCheckpointStatus,
    progress: row.progress ?? {},
    retryCount: Number(row.retry_count ?? 0),
    lastSuccessfulSyncAt: row.last_successful_sync_at,
    lastAttemptedSyncAt: row.last_attempted_sync_at,
    leaseOwner: row.lease_owner,
    leaseUntil: row.lease_until,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseWarehouseCheckpointRepository implements WarehouseCheckpointRepository {
  async get(key: WarehouseCheckpointKey): Promise<WarehouseCheckpointRecord | null> {
    const supabase = createAdminClient();
    const shard = normalizeCheckpointShard(key.shard);
    const { data, error } = await supabase
      .from("warehouse_checkpoints")
      .select("*")
      .eq("marketplace_type", key.marketplaceType)
      .eq("company_id", Number(key.companyId))
      .eq("marketplace_account_id", Number(key.marketplaceAccountId))
      .eq("entity", key.entity)
      .eq("mode", key.mode)
      .eq("shard", shard)
      .maybeSingle();

    if (error) throw new Error(`WarehouseCheckpointRepository.get failed: ${error.message}`);
    return data ? mapRow(data as CheckpointRow) : null;
  }

  async listByAccount(marketplaceAccountId: string): Promise<WarehouseCheckpointRecord[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("warehouse_checkpoints")
      .select("*")
      .eq("marketplace_account_id", Number(marketplaceAccountId))
      .order("entity")
      .order("mode");

    if (error) {
      throw new Error(`WarehouseCheckpointRepository.listByAccount failed: ${error.message}`);
    }
    return (data ?? []).map((row) => mapRow(row as CheckpointRow));
  }

  async upsert(input: UpsertWarehouseCheckpointInput): Promise<WarehouseCheckpointRecord> {
    const existing = await this.get(input.key);
    const supabase = createAdminClient();
    const key = input.key;
    const shard = normalizeCheckpointShard(key.shard);
    const now = new Date().toISOString();

    const row = {
      marketplace_type: key.marketplaceType,
      company_id: Number(key.companyId),
      marketplace_account_id: Number(key.marketplaceAccountId),
      entity: key.entity,
      mode: key.mode,
      shard,
      cursor: input.cursor !== undefined ? input.cursor : (existing?.cursor ?? null),
      window_start:
        input.windowStart !== undefined ? input.windowStart : (existing?.windowStart ?? null),
      window_end:
        input.windowEnd !== undefined ? input.windowEnd : (existing?.windowEnd ?? null),
      status: input.status ?? existing?.status ?? "idle",
      progress: input.progress ?? existing?.progress ?? {},
      retry_count: input.retryCount ?? existing?.retryCount ?? 0,
      last_successful_sync_at:
        input.lastSuccessfulSyncAt !== undefined
          ? input.lastSuccessfulSyncAt
          : (existing?.lastSuccessfulSyncAt ?? null),
      last_attempted_sync_at:
        input.lastAttemptedSyncAt !== undefined
          ? input.lastAttemptedSyncAt
          : (existing?.lastAttemptedSyncAt ?? null),
      lease_owner:
        input.leaseOwner !== undefined ? input.leaseOwner : (existing?.leaseOwner ?? null),
      lease_until:
        input.leaseUntil !== undefined ? input.leaseUntil : (existing?.leaseUntil ?? null),
      error_code:
        input.errorCode !== undefined ? input.errorCode : (existing?.errorCode ?? null),
      error_message:
        input.errorMessage !== undefined ? input.errorMessage : (existing?.errorMessage ?? null),
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("warehouse_checkpoints")
      .upsert(row as never, {
        onConflict: "marketplace_type,company_id,marketplace_account_id,entity,mode,shard",
      })
      .select("*")
      .single();

    if (error) throw new Error(`WarehouseCheckpointRepository.upsert failed: ${error.message}`);
    return mapRow(data as CheckpointRow);
  }
}
