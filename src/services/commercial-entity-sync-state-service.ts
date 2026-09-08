/**
 * Durable commercial entity sync state (DB-backed).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  COMMERCIAL_SYNC_ENTITIES,
  type CommercialEntityStatus,
  type CommercialEntitySyncStateRow,
  type CommercialSyncEntity,
} from "@/lib/commercial-continuity/types";

function isMissingRelation(message: string): boolean {
  return /does not exist|schema cache|Could not find/i.test(message);
}

export async function commercialEntityStateAvailable(): Promise<boolean> {
  const sb = createAdminClient();
  const { error } = await sb.from("commercial_entity_sync_state").select("entity").limit(1);
  return !error;
}

export async function ensureCommercialEntityRows(
  marketplaceAccountId: string
): Promise<void> {
  if (!(await commercialEntityStateAvailable())) return;
  const sb = createAdminClient();
  const rows = COMMERCIAL_SYNC_ENTITIES.map((entity) => ({
    marketplace_account_id: String(marketplaceAccountId),
    entity,
    status: "idle" as const,
    retry_count: 0,
    rows_upserted_last: 0,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from("commercial_entity_sync_state").upsert(rows, {
    onConflict: "marketplace_account_id,entity",
    ignoreDuplicates: true,
  });
  if (error && !isMissingRelation(error.message)) {
    console.warn("[commercial-entity-state] ensure failed:", error.message);
  }
}

export async function listCommercialEntityStates(
  marketplaceAccountId: string
): Promise<CommercialEntitySyncStateRow[]> {
  if (!(await commercialEntityStateAvailable())) return [];
  await ensureCommercialEntityRows(marketplaceAccountId);
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("commercial_entity_sync_state")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId)
    .order("entity");
  if (error) {
    if (isMissingRelation(error.message)) return [];
    console.warn("[commercial-entity-state] list failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    ...row,
    marketplace_account_id: String(row.marketplace_account_id),
  })) as CommercialEntitySyncStateRow[];
}

export async function getCommercialEntityState(
  marketplaceAccountId: string,
  entity: CommercialSyncEntity
): Promise<CommercialEntitySyncStateRow | null> {
  const rows = await listCommercialEntityStates(marketplaceAccountId);
  return rows.find((r) => r.entity === entity) ?? null;
}

export type UpsertCommercialEntityStateInput = {
  marketplaceAccountId: string;
  entity: CommercialSyncEntity;
  status: CommercialEntityStatus;
  failureClass?: string | null;
  lastError?: string | null;
  latestDataDate?: string | null;
  lastRequestedFrom?: string | null;
  lastRequestedTo?: string | null;
  lastSyncRunId?: string | null;
  rowsUpsertedLast?: number;
  markSuccessfulExecution?: boolean;
  bumpRetry?: boolean;
  clearRetry?: boolean;
  nextRetryAt?: string | null;
  retryCount?: number;
};

export async function upsertCommercialEntityState(
  input: UpsertCommercialEntityStateInput
): Promise<void> {
  if (!(await commercialEntityStateAvailable())) return;
  await ensureCommercialEntityRows(input.marketplaceAccountId);

  const existing = await getCommercialEntityState(input.marketplaceAccountId, input.entity);
  const now = new Date().toISOString();
  let retryCount = existing?.retry_count ?? 0;
  if (input.clearRetry) retryCount = 0;
  else if (input.bumpRetry) retryCount += 1;
  else if (input.retryCount != null) retryCount = input.retryCount;

  const patch = {
    marketplace_account_id: String(input.marketplaceAccountId),
    entity: input.entity,
    status: input.status,
    failure_class: input.failureClass ?? null,
    last_error: input.lastError ?? null,
    last_execution_at: now,
    last_successful_execution_at: input.markSuccessfulExecution
      ? now
      : existing?.last_successful_execution_at ?? null,
    latest_data_date:
      input.latestDataDate !== undefined
        ? input.latestDataDate
        : existing?.latest_data_date ?? null,
    last_requested_from:
      input.lastRequestedFrom !== undefined
        ? input.lastRequestedFrom
        : existing?.last_requested_from ?? null,
    last_requested_to:
      input.lastRequestedTo !== undefined
        ? input.lastRequestedTo
        : existing?.last_requested_to ?? null,
    last_sync_run_id:
      input.lastSyncRunId !== undefined
        ? input.lastSyncRunId
        : existing?.last_sync_run_id ?? null,
    rows_upserted_last: input.rowsUpsertedLast ?? existing?.rows_upserted_last ?? 0,
    retry_count: retryCount,
    next_retry_at:
      input.nextRetryAt !== undefined ? input.nextRetryAt : existing?.next_retry_at ?? null,
    updated_at: now,
  };

  const sb = createAdminClient();
  const { error } = await sb.from("commercial_entity_sync_state").upsert(patch, {
    onConflict: "marketplace_account_id,entity",
  });
  if (error) console.warn("[commercial-entity-state] upsert failed:", error.message);
}

export async function readLatestDataDateFromDb(
  marketplaceAccountId: string,
  entity: CommercialSyncEntity
): Promise<string | null> {
  const sb = createAdminClient();

  if (entity === "orders") {
    const { data, error } = await sb
      .from("wb_orders")
      .select("order_date")
      .eq("marketplace_account_id", marketplaceAccountId)
      .order("order_date", { ascending: false })
      .limit(1);
    if (error || !data?.[0]?.order_date) return null;
    return String(data[0].order_date).slice(0, 10);
  }

  if (entity === "sales") {
    const { data, error } = await sb
      .from("wb_sales")
      .select("sale_date")
      .eq("marketplace_account_id", marketplaceAccountId)
      .order("sale_date", { ascending: false })
      .limit(1);
    if (error || !data?.[0]?.sale_date) return null;
    return String(data[0].sale_date).slice(0, 10);
  }

  const { data, error } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", marketplaceAccountId)
    .order("operation_date", { ascending: false })
    .limit(1);
  if (error || !data?.[0]?.operation_date) return null;
  return String(data[0].operation_date).slice(0, 10);
}
