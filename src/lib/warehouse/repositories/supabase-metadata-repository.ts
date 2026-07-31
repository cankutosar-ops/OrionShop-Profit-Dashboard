/**
 * Sprint 10.1 — Metadata + raw intake repositories (Supabase).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  InsertWarehouseRawIntakeMetaInput,
  WarehouseEntityCatalogEntry,
  WarehouseLayerRegistryEntry,
  WarehouseMetadataRepository,
  WarehouseRawIntakeMetaRecord,
  WarehouseRawMetadataRepository,
} from "@/lib/warehouse/repositories/contracts";
import type { WarehouseLayer, WarehousePlatformEntity } from "@/lib/warehouse/types";

export class SupabaseWarehouseMetadataRepository implements WarehouseMetadataRepository {
  async listEntities(): Promise<WarehouseEntityCatalogEntry[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("warehouse_entity_catalog")
      .select("*")
      .order("entity");

    if (error) throw new Error(`WarehouseMetadataRepository.listEntities failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      entity: row.entity as WarehousePlatformEntity,
      label: String(row.label),
      layer: row.layer as WarehouseLayer,
      description: String(row.description ?? ""),
      isRequiredForHealthy: Boolean(row.is_required_for_healthy),
    }));
  }

  async listLayers(): Promise<WarehouseLayerRegistryEntry[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("warehouse_layer_registry")
      .select("*")
      .order("layer");

    if (error) throw new Error(`WarehouseMetadataRepository.listLayers failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      layer: row.layer as WarehouseLayer,
      label: String(row.label),
      description: String(row.description),
    }));
  }
}

type RawRow = {
  id: string;
  session_id: string | null;
  marketplace_type: string;
  company_id: number;
  marketplace_account_id: number;
  entity: string;
  endpoint_family: string;
  request_fingerprint: string | null;
  window_from: string | null;
  window_to: string | null;
  cursor_before: string | null;
  cursor_after: string | null;
  http_status_class: string | null;
  payload_digest: string | null;
  records_read: number;
  meta: Record<string, unknown>;
  created_at: string;
};

function mapRaw(row: RawRow): WarehouseRawIntakeMetaRecord {
  return {
    id: String(row.id),
    sessionId: row.session_id,
    marketplaceType: row.marketplace_type,
    companyId: String(row.company_id),
    marketplaceAccountId: String(row.marketplace_account_id),
    entity: row.entity as WarehousePlatformEntity,
    endpointFamily: row.endpoint_family ?? "",
    requestFingerprint: row.request_fingerprint,
    windowFrom: row.window_from,
    windowTo: row.window_to,
    cursorBefore: row.cursor_before,
    cursorAfter: row.cursor_after,
    httpStatusClass: row.http_status_class,
    payloadDigest: row.payload_digest,
    recordsRead: Number(row.records_read ?? 0),
    meta: row.meta ?? {},
    createdAt: row.created_at,
  };
}

export class SupabaseWarehouseRawMetadataRepository implements WarehouseRawMetadataRepository {
  async insert(input: InsertWarehouseRawIntakeMetaInput): Promise<WarehouseRawIntakeMetaRecord> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("warehouse_raw_intake_meta")
      .insert({
        session_id: input.sessionId ?? null,
        marketplace_type: input.marketplaceType,
        company_id: Number(input.companyId),
        marketplace_account_id: Number(input.marketplaceAccountId),
        entity: input.entity,
        endpoint_family: input.endpointFamily ?? "",
        request_fingerprint: input.requestFingerprint ?? null,
        window_from: input.windowFrom ?? null,
        window_to: input.windowTo ?? null,
        cursor_before: input.cursorBefore ?? null,
        cursor_after: input.cursorAfter ?? null,
        http_status_class: input.httpStatusClass ?? null,
        payload_digest: input.payloadDigest ?? null,
        records_read: input.recordsRead ?? 0,
        meta: input.meta ?? {},
      } as never)
      .select("*")
      .single();

    if (error) throw new Error(`WarehouseRawMetadataRepository.insert failed: ${error.message}`);
    return mapRaw(data as RawRow);
  }

  async listByAccount(
    marketplaceAccountId: string,
    limit = 50
  ): Promise<WarehouseRawIntakeMetaRecord[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("warehouse_raw_intake_meta")
      .select("*")
      .eq("marketplace_account_id", Number(marketplaceAccountId))
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`WarehouseRawMetadataRepository.listByAccount failed: ${error.message}`);
    }
    return (data ?? []).map((row) => mapRaw(row as RawRow));
  }
}
