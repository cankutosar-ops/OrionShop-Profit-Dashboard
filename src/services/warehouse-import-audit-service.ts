/**
 * Sprint 11 — warehouse import audit (immutable start + finish update).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  WarehouseEntity,
  WarehouseImportAudit,
  WarehouseImportAuditStatus,
  WarehouseImportTrigger,
} from "@/lib/historical-warehouse/types";

function isMissingTable(message: string): boolean {
  return /does not exist|schema cache|Could not find/i.test(message);
}

export async function startWarehouseImportAudit(params: {
  marketplaceAccountId: string | number;
  entity: WarehouseEntity;
  trigger?: WarehouseImportTrigger;
  currentDataset?: string | null;
  meta?: Record<string, unknown>;
}): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("warehouse_import_audit")
    .insert({
      marketplace_account_id: Number(params.marketplaceAccountId),
      entity: params.entity,
      trigger: params.trigger ?? "manual",
      status: "running",
      current_dataset: params.currentDataset ?? null,
      meta: params.meta ?? {},
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message)) return null;
    throw new Error(`startWarehouseImportAudit failed: ${error.message}`);
  }
  return data?.id ? String(data.id) : null;
}

export async function finishWarehouseImportAudit(params: {
  auditId: string | null;
  status: WarehouseImportAuditStatus;
  recordsRead?: number;
  rowsInserted?: number;
  rowsUpdated?: number;
  rowsSkipped?: number;
  validationResult?: string | null;
  errors?: unknown[];
  currentDataset?: string | null;
  currentPage?: number | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  if (!params.auditId) return;

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("warehouse_import_audit")
    .select("started_at, meta")
    .eq("id", params.auditId)
    .maybeSingle();

  const startedAt = existing?.started_at ? new Date(existing.started_at).getTime() : Date.now();
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt);
  const prevMeta =
    existing?.meta && typeof existing.meta === "object"
      ? (existing.meta as Record<string, unknown>)
      : {};

  const { error } = await supabase
    .from("warehouse_import_audit")
    .update({
      status: params.status,
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      records_read: params.recordsRead ?? 0,
      rows_inserted: params.rowsInserted ?? 0,
      rows_updated: params.rowsUpdated ?? 0,
      rows_skipped: params.rowsSkipped ?? 0,
      validation_result: params.validationResult ?? null,
      errors: params.errors ?? [],
      current_dataset: params.currentDataset ?? null,
      current_page: params.currentPage ?? null,
      meta: { ...prevMeta, ...(params.meta ?? {}) },
    })
    .eq("id", params.auditId);

  if (error && !isMissingTable(error.message)) {
    throw new Error(`finishWarehouseImportAudit failed: ${error.message}`);
  }
}

export async function listWarehouseImportAudits(
  marketplaceAccountId: string | number,
  limit = 20
): Promise<WarehouseImportAudit[]> {
  const supabase = createAdminClient();
  const accountId = Number(marketplaceAccountId);
  const { data, error } = await supabase
    .from("warehouse_import_audit")
    .select("*")
    .eq("marketplace_account_id", accountId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTable(error.message)) return [];
    throw new Error(`listWarehouseImportAudits failed: ${error.message}`);
  }
  return (data ?? []) as WarehouseImportAudit[];
}
