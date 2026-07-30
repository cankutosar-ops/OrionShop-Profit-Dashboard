/**
 * Sprint 10 — Historical Inventory Import (idempotent upsert from archives).
 * Reads filesystem archives only; does not call Wildberries at runtime.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseHistoricalDayRawCsv,
  parseHistoricalWideCsv,
} from "@/lib/historical-inventory-csv";
import type { HistoricalInventorySnapshotInsert } from "@/lib/historical-inventory-types";

const DEFAULT_ARCHIVE_ROOT = resolve(process.cwd(), "exports/historical-inventory");
const UPSERT_CHUNK = 500;

export type HistoricalInventoryImportResult = {
  archiveRoot: string;
  accountsProcessed: Array<{
    accountId: number;
    source: string;
    rowsParsed: number;
    rowsUpserted: number;
    error?: string;
  }>;
  totalParsed: number;
  totalUpserted: number;
};

function accountDirs(archiveRoot: string): Array<{ accountId: number; dir: string }> {
  if (!existsSync(archiveRoot)) return [];
  return readdirSync(archiveRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^account-\d+$/.test(d.name))
    .map((d) => ({
      accountId: Number(d.name.replace("account-", "")),
      dir: join(archiveRoot, d.name),
    }))
    .filter((a) => {
      if (!Number.isFinite(a.accountId) || a.accountId <= 0) return false;
      const wide = join(a.dir, "_source", "STOCK_HISTORY_DAILY_wide.csv");
      if (existsSync(wide)) return true;
      // Skip empty verify-fixture folders with no day raw.csv
      const days = readdirSync(a.dir, { withFileTypes: true }).filter(
        (d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name)
      );
      return days.some((d) => existsSync(join(a.dir, d.name, "raw.csv")));
    });
}

async function upsertRows(
  rows: HistoricalInventorySnapshotInsert[]
): Promise<number> {
  if (!rows.length) return 0;
  const supabase = createAdminClient();
  let upserted = 0;

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const batch = rows.slice(i, i + UPSERT_CHUNK);
    const { error, count } = await supabase.from("historical_inventory_snapshots").upsert(batch, {
      onConflict:
        "marketplace_account_id,snapshot_date,warehouse_name,nm_id,size,seller_article,barcode",
      ignoreDuplicates: false,
      count: "exact",
    });
    if (error) {
      throw new Error(`Upsert failed: ${error.message}`);
    }
    upserted += count ?? batch.length;
  }
  return upserted;
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadRowsForAccount(
  accountId: number,
  accountDir: string
): { rows: HistoricalInventorySnapshotInsert[]; source: string } {
  const today = todayIsoDate();
  const widePath = join(accountDir, "_source", "STOCK_HISTORY_DAILY_wide.csv");
  if (existsSync(widePath)) {
    const text = readFileSync(widePath, "utf8");
    // Never import "today" from CSV — no transit fields; daily Analytics snapshot owns today.
    const rows = parseHistoricalWideCsv(text, accountId).filter(
      (r) => r.snapshot_date < today
    );
    return {
      rows,
      source: widePath,
    };
  }

  // Fallback: per-day raw.csv folders
  const dayDirs = readdirSync(accountDir, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name)
  );
  const rows: HistoricalInventorySnapshotInsert[] = [];
  for (const d of dayDirs) {
    if (d.name >= today) continue;
    const raw = join(accountDir, d.name, "raw.csv");
    if (!existsSync(raw)) continue;
    rows.push(
      ...parseHistoricalDayRawCsv(readFileSync(raw, "utf8"), accountId, d.name)
    );
  }
  return { rows, source: `${accountDir}/*/raw.csv` };
}

/**
 * Import archived account folders under exports/historical-inventory.
 * Safe to re-run (unique grain upsert).
 * Optional accountIds limits which account-* folders are processed.
 */
export async function importHistoricalInventoryFromArchives(
  archiveRoot = DEFAULT_ARCHIVE_ROOT,
  options?: { accountIds?: Array<string | number> }
): Promise<HistoricalInventoryImportResult> {
  const allow = options?.accountIds?.length
    ? new Set(options.accountIds.map((id) => Number(id)))
    : null;
  const accounts = accountDirs(archiveRoot).filter((a) =>
    allow ? allow.has(a.accountId) : true
  );
  const result: HistoricalInventoryImportResult = {
    archiveRoot,
    accountsProcessed: [],
    totalParsed: 0,
    totalUpserted: 0,
  };

  for (const account of accounts) {
    let source = account.dir;
    let rows: HistoricalInventorySnapshotInsert[] = [];
    try {
      const loaded = loadRowsForAccount(account.accountId, account.dir);
      source = loaded.source;
      rows = loaded.rows;
      const upserted = await upsertRows(rows);
      result.accountsProcessed.push({
        accountId: account.accountId,
        source,
        rowsParsed: rows.length,
        rowsUpserted: upserted,
      });
      result.totalParsed += rows.length;
      result.totalUpserted += upserted;
    } catch (err) {
      result.accountsProcessed.push({
        accountId: account.accountId,
        source,
        rowsParsed: rows.length,
        rowsUpserted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      result.totalParsed += rows.length;
    }
  }

  return result;
}

/** Resolve archived WB original CSV path for Download Original CSV. */
export function resolveOriginalCsvPath(
  marketplaceAccountId: string | number,
  archiveRoot = DEFAULT_ARCHIVE_ROOT
): string | null {
  const dir = join(archiveRoot, `account-${marketplaceAccountId}`, "_source");
  const wide = join(dir, "STOCK_HISTORY_DAILY_wide.csv");
  if (existsSync(wide)) return wide;
  if (!existsSync(dir)) return null;
  const zip = readdirSync(dir).find((n) => n.toLowerCase().endsWith(".zip"));
  return zip ? join(dir, zip) : null;
}

export function resolveDayRawCsvPath(
  marketplaceAccountId: string | number,
  snapshotDate: string,
  archiveRoot = DEFAULT_ARCHIVE_ROOT
): string | null {
  const path = join(
    archiveRoot,
    `account-${marketplaceAccountId}`,
    snapshotDate,
    "raw.csv"
  );
  return existsSync(path) ? path : null;
}
