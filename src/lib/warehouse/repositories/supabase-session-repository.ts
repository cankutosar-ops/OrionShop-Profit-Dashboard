/**
 * Sprint 10.1 — Supabase sync session repository (metadata CRUD only).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { WarehouseSyncSessionRepository } from "@/lib/warehouse/repositories/contracts";
import type {
  CreateWarehouseSyncSessionInput,
  UpdateWarehouseSyncSessionInput,
  WarehouseSyncSessionRecord,
  WarehouseSyncSessionStatistics,
} from "@/lib/warehouse/sessions/types";
import type {
  WarehouseMarketplaceType,
  WarehousePlatformEntity,
  WarehouseSessionStatus,
  WarehouseSyncMode,
  WarehouseTriggerSource,
} from "@/lib/warehouse/types";

type SessionRow = {
  id: string;
  marketplace_type: string;
  company_id: number;
  marketplace_account_id: number;
  entity: string;
  mode: string;
  trigger_source: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  checkpoint_id: number | null;
  statistics: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function mapRow(row: SessionRow): WarehouseSyncSessionRecord {
  return {
    id: String(row.id),
    marketplaceType: row.marketplace_type as WarehouseMarketplaceType,
    companyId: String(row.company_id),
    marketplaceAccountId: String(row.marketplace_account_id),
    entity: row.entity as WarehousePlatformEntity,
    mode: row.mode as WarehouseSyncMode,
    triggerSource: row.trigger_source as WarehouseTriggerSource,
    status: row.status as WarehouseSessionStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    checkpointId: row.checkpoint_id == null ? null : String(row.checkpoint_id),
    statistics: (row.statistics ?? {}) as WarehouseSyncSessionStatistics,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    meta: row.meta ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseWarehouseSyncSessionRepository implements WarehouseSyncSessionRepository {
  async getById(id: string): Promise<WarehouseSyncSessionRecord | null> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("warehouse_sync_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`WarehouseSyncSessionRepository.getById failed: ${error.message}`);
    return data ? mapRow(data as SessionRow) : null;
  }

  async listByAccount(
    marketplaceAccountId: string,
    limit = 50
  ): Promise<WarehouseSyncSessionRecord[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("warehouse_sync_sessions")
      .select("*")
      .eq("marketplace_account_id", Number(marketplaceAccountId))
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`WarehouseSyncSessionRepository.listByAccount failed: ${error.message}`);
    }
    return (data ?? []).map((row) => mapRow(row as SessionRow));
  }

  async create(input: CreateWarehouseSyncSessionInput): Promise<WarehouseSyncSessionRecord> {
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("warehouse_sync_sessions")
      .insert({
        marketplace_type: input.marketplaceType,
        company_id: Number(input.companyId),
        marketplace_account_id: Number(input.marketplaceAccountId),
        entity: input.entity,
        mode: input.mode,
        trigger_source: input.triggerSource ?? "manual",
        status: "pending",
        checkpoint_id: input.checkpointId ? Number(input.checkpointId) : null,
        statistics: {},
        meta: input.meta ?? {},
        created_at: now,
        updated_at: now,
      } as never)
      .select("*")
      .single();

    if (error) throw new Error(`WarehouseSyncSessionRepository.create failed: ${error.message}`);
    return mapRow(data as SessionRow);
  }

  async update(
    id: string,
    patch: UpdateWarehouseSyncSessionInput
  ): Promise<WarehouseSyncSessionRecord> {
    const supabase = createAdminClient();
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.startedAt !== undefined) payload.started_at = patch.startedAt;
    if (patch.finishedAt !== undefined) payload.finished_at = patch.finishedAt;
    if (patch.checkpointId !== undefined) {
      payload.checkpoint_id = patch.checkpointId ? Number(patch.checkpointId) : null;
    }
    if (patch.statistics !== undefined) payload.statistics = patch.statistics;
    if (patch.errorCode !== undefined) payload.error_code = patch.errorCode;
    if (patch.errorMessage !== undefined) payload.error_message = patch.errorMessage;
    if (patch.meta !== undefined) payload.meta = patch.meta;

    const { data, error } = await supabase
      .from("warehouse_sync_sessions")
      .update(payload as never)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new Error(`WarehouseSyncSessionRepository.update failed: ${error.message}`);
    return mapRow(data as SessionRow);
  }
}
