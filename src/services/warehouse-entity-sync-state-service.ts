/**
 * Sprint 11 — warehouse entity sync state persistence (idempotent upsert).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  WAREHOUSE_ENTITIES,
  type WarehouseEntity,
  type WarehouseEntityProgress,
  type WarehouseEntityStage,
  type WarehouseEntitySyncState,
} from "@/lib/historical-warehouse/types";
import type { Database } from "@/types/database";

function isMissingTable(message: string): boolean {
  return /does not exist|schema cache|Could not find/i.test(message);
}

export async function ensureWarehouseEntityRows(
  marketplaceAccountId: string | number
): Promise<void> {
  const supabase = createAdminClient();
  const accountId = Number(marketplaceAccountId);
  const rows = WAREHOUSE_ENTITIES.map((entity) => ({
    marketplace_account_id: accountId,
    entity,
    stage: "pending" as const,
    progress: {},
  }));

  const { error } = await supabase.from("warehouse_entity_sync_state").upsert(rows, {
    onConflict: "marketplace_account_id,entity",
    ignoreDuplicates: true,
  });

  if (error && !isMissingTable(error.message)) {
    throw new Error(`ensureWarehouseEntityRows failed: ${error.message}`);
  }
}

export async function listWarehouseEntityStates(
  marketplaceAccountId: string | number
): Promise<WarehouseEntitySyncState[]> {
  const supabase = createAdminClient();
  const accountId = Number(marketplaceAccountId);
  const { data, error } = await supabase
    .from("warehouse_entity_sync_state")
    .select("*")
    .eq("marketplace_account_id", accountId)
    .order("entity");

  if (error) {
    if (isMissingTable(error.message)) return [];
    throw new Error(`listWarehouseEntityStates failed: ${error.message}`);
  }
  return (data ?? []) as WarehouseEntitySyncState[];
}

export async function getWarehouseEntityState(
  marketplaceAccountId: string | number,
  entity: WarehouseEntity
): Promise<WarehouseEntitySyncState | null> {
  const supabase = createAdminClient();
  const accountId = Number(marketplaceAccountId);
  const { data, error } = await supabase
    .from("warehouse_entity_sync_state")
    .select("*")
    .eq("marketplace_account_id", accountId)
    .eq("entity", entity)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message)) return null;
    throw new Error(`getWarehouseEntityState failed: ${error.message}`);
  }
  return (data as WarehouseEntitySyncState | null) ?? null;
}

export type UpdateWarehouseEntityStateInput = {
  marketplaceAccountId: string | number;
  entity: WarehouseEntity;
  stage?: WarehouseEntityStage;
  progress?: WarehouseEntityProgress;
  currentDataset?: string | null;
  currentPage?: number | null;
  errorMessage?: string | null;
  bumpRetry?: boolean;
  markStarted?: boolean;
  markCompleted?: boolean;
  markSuccessfulSync?: boolean;
  markFailedSync?: boolean;
};

export async function updateWarehouseEntityState(
  input: UpdateWarehouseEntityStateInput
): Promise<WarehouseEntitySyncState | null> {
  await ensureWarehouseEntityRows(input.marketplaceAccountId);

  const existing = await getWarehouseEntityState(input.marketplaceAccountId, input.entity);
  const now = new Date().toISOString();
  const patch = {
    marketplace_account_id: Number(input.marketplaceAccountId),
    entity: input.entity,
    updated_at: now,
  } as Database["public"]["Tables"]["warehouse_entity_sync_state"]["Update"] &
    Pick<
      Database["public"]["Tables"]["warehouse_entity_sync_state"]["Insert"],
      "marketplace_account_id" | "entity"
    >;

  if (input.stage) patch.stage = input.stage;
  if (input.progress) patch.progress = input.progress;
  if (input.currentDataset !== undefined) patch.current_dataset = input.currentDataset;
  if (input.currentPage !== undefined) patch.current_page = input.currentPage;
  if (input.errorMessage !== undefined) patch.error_message = input.errorMessage;
  if (input.markStarted) patch.started_at = existing?.started_at ?? now;
  if (input.markCompleted) patch.completed_at = now;
  if (input.markSuccessfulSync) {
    patch.last_successful_sync_at = now;
    patch.error_message = null;
  }
  if (input.markFailedSync) patch.last_failed_sync_at = now;
  if (input.bumpRetry) patch.retry_count = (existing?.retry_count ?? 0) + 1;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("warehouse_entity_sync_state")
    .upsert(patch, { onConflict: "marketplace_account_id,entity" })
    .select("*")
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message)) return null;
    throw new Error(`updateWarehouseEntityState failed: ${error.message}`);
  }
  return (data as WarehouseEntitySyncState | null) ?? null;
}

/** True when entity may run incremental sync (complete / incremental / healthy). */
export function entityAllowsIncremental(stage: WarehouseEntityStage | null | undefined): boolean {
  return (
    stage === "complete" ||
    stage === "incremental_sync_active" ||
    stage === "healthy"
  );
}
