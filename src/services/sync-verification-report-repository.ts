import { createAdminClient } from "@/lib/supabase/admin";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import type { SyncVerificationReportRow, VerificationSnapshot } from "@/lib/sync-verification-audit/types";

const FS_ROOT = resolve(process.cwd(), "exports/verification-history");

function mapRow(data: Record<string, unknown>): SyncVerificationReportRow {
  return {
    id: String(data.id),
    marketplace_account_id: String(data.marketplace_account_id),
    verified_at: String(data.verified_at),
    expected_as_of: String(data.expected_as_of).slice(0, 10),
    health_score: Number(data.health_score),
    overall_result: data.overall_result as SyncVerificationReportRow["overall_result"],
    schema_status: data.schema_status as SyncVerificationReportRow["schema_status"],
    orders_status: String(data.orders_status),
    sales_status: String(data.sales_status),
    finance_status: String(data.finance_status),
    inventory_status: String(data.inventory_status),
    sync_status: (data.sync_status as string | null) ?? null,
    sync_request_id: (data.sync_request_id as string | null) ?? null,
    sync_duration_ms: data.sync_duration_ms == null ? null : Number(data.sync_duration_ms),
    snapshot: data.snapshot as VerificationSnapshot,
    failures: (data.failures as SyncVerificationReportRow["failures"]) ?? [],
    created_at: String(data.created_at),
  };
}

function isMissingTableError(message: string): boolean {
  return /does not exist|Could not find the table|schema cache/i.test(message);
}

function accountDir(marketplaceAccountId: string): string {
  return join(FS_ROOT, marketplaceAccountId);
}

function writeFsReport(row: SyncVerificationReportRow): void {
  const dir = accountDir(row.marketplace_account_id);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${row.id}.json`);
  // Immutable: refuse overwrite if file already exists.
  if (existsSync(path)) {
    throw new Error(`Verification snapshot already exists on disk: ${path}`);
  }
  writeFileSync(path, JSON.stringify(row, null, 2), "utf8");
}

function listFsReports(marketplaceAccountId: string, limit: number): SyncVerificationReportRow[] {
  const dir = accountDir(marketplaceAccountId);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(dir, f));
  const rows = files.map((f) => mapRow(JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>));
  rows.sort((a, b) => b.verified_at.localeCompare(a.verified_at));
  return rows.slice(0, limit);
}

function getFsReport(id: string): SyncVerificationReportRow | null {
  if (!existsSync(FS_ROOT)) return null;
  for (const account of readdirSync(FS_ROOT)) {
    const path = join(FS_ROOT, account, `${id}.json`);
    if (existsSync(path)) {
      return mapRow(JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>);
    }
  }
  return null;
}

export async function insertVerificationReport(input: {
  marketplaceAccountId: string;
  expectedAsOf: string;
  healthScore: number;
  overallResult: SyncVerificationReportRow["overall_result"];
  schemaStatus: SyncVerificationReportRow["schema_status"];
  ordersStatus: string;
  salesStatus: string;
  financeStatus: string;
  inventoryStatus: string;
  syncStatus: string | null;
  syncRequestId: string | null;
  syncDurationMs: number | null;
  snapshot: VerificationSnapshot;
  failures: SyncVerificationReportRow["failures"];
}): Promise<SyncVerificationReportRow> {
  const now = new Date().toISOString();
  const payload = {
    marketplace_account_id: input.marketplaceAccountId,
    expected_as_of: input.expectedAsOf,
    health_score: input.healthScore,
    overall_result: input.overallResult,
    schema_status: input.schemaStatus,
    orders_status: input.ordersStatus,
    sales_status: input.salesStatus,
    finance_status: input.financeStatus,
    inventory_status: input.inventoryStatus,
    sync_status: input.syncStatus,
    sync_request_id: input.syncRequestId,
    sync_duration_ms: input.syncDurationMs,
    snapshot: input.snapshot,
    failures: input.failures,
  };

  try {
    const client = createAdminClient();
    const { data, error } = await client
      .from("sync_verification_reports" as never)
      .insert(payload as never)
      .select("*")
      .single();

    if (error) {
      if (!isMissingTableError(error.message)) {
        throw new Error(`Failed to persist verification report: ${error.message}`);
      }
    } else {
      const row = mapRow(data as Record<string, unknown>);
      // Dual-write filesystem copy for local audit durability (still immutable).
      try {
        writeFsReport(row);
      } catch {
        // DB is source of truth when available.
      }
      return row;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isMissingTableError(message)) throw err;
  }

  // Filesystem fallback until migration is applied.
  const row: SyncVerificationReportRow = {
    id: crypto.randomUUID(),
    ...payload,
    verified_at: now,
    created_at: now,
  };
  writeFsReport(row);
  return row;
}

export async function listVerificationReports(
  marketplaceAccountId: string,
  limit = 50
): Promise<SyncVerificationReportRow[]> {
  try {
    const client = createAdminClient();
    const { data, error } = await client
      .from("sync_verification_reports" as never)
      .select("*")
      .eq("marketplace_account_id", marketplaceAccountId)
      .order("verified_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingTableError(error.message)) {
        return listFsReports(marketplaceAccountId, limit);
      }
      throw new Error(`Failed to list verification reports: ${error.message}`);
    }
    const rows = (data as Record<string, unknown>[] | null)?.map(mapRow) ?? [];
    if (rows.length) return rows;
    return listFsReports(marketplaceAccountId, limit);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingTableError(message)) return listFsReports(marketplaceAccountId, limit);
    throw err;
  }
}

export async function getVerificationReport(
  id: string
): Promise<SyncVerificationReportRow | null> {
  try {
    const client = createAdminClient();
    const { data, error } = await client
      .from("sync_verification_reports" as never)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message)) return getFsReport(id);
      throw new Error(`Failed to load verification report: ${error.message}`);
    }
    if (data) return mapRow(data as Record<string, unknown>);
    return getFsReport(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingTableError(message)) return getFsReport(id);
    throw err;
  }
}
