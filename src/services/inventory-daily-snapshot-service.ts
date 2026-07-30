/**
 * Sprint 11.1 — Daily inventory snapshot sync.
 *
 * Marketplace Inventory API → historical_inventory_snapshots → Inventory History
 * Idempotent upsert for (account, snapshot_date, warehouse, nm, size, article, barcode).
 */

import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseHistoricalDayRawCsv,
  parseHistoricalWideCsv,
} from "@/lib/historical-inventory-csv";
import type { HistoricalInventorySnapshotInsert } from "@/lib/historical-inventory-types";
import { filterOperationalMarketplaceAccounts } from "@/lib/marketplace-account-visibility";
import { WbApiClient } from "@/lib/wildberries/api-client";
import { syncLog } from "@/lib/wildberries/sync-log";
import type { WbWarehouseStockItem } from "@/lib/wildberries/types";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import { updateWarehouseEntityState } from "@/services/warehouse-entity-sync-state-service";
import {
  finishWarehouseImportAudit,
  startWarehouseImportAudit,
} from "@/services/warehouse-import-audit-service";

const UPSERT_CHUNK = 500;
const DEFAULT_ARCHIVE_ROOT = resolve(process.cwd(), "exports/historical-inventory");

export type DailyInventorySnapshotResult = {
  marketplaceAccountId: string;
  snapshotDate: string;
  status: "success" | "partial" | "failed" | "skipped";
  recordsRead: number;
  rowsUpserted: number;
  rowsSkipped: number;
  missingDatesDetected: string[];
  gapsFilled: string[];
  message: string;
  auditId: string | null;
};

type ProductEnrichment = {
  sellerArticle: string;
  brand: string;
  subject: string;
  barcode: string;
};

type ChrtSizeInfo = {
  techSize: string;
  barcode: string;
};

function chrtKey(nmId: number, chrtId: number): string {
  return `${nmId}:${chrtId}`;
}

function buildChrtSizeMapFromCards(
  cards: Awaited<ReturnType<WbApiClient["fetchAllProductCards"]>>
): Map<string, ChrtSizeInfo> {
  const map = new Map<string, ChrtSizeInfo>();
  for (const card of cards) {
    const nmId = Number(card.nmID);
    if (!Number.isFinite(nmId) || nmId <= 0) continue;
    for (const size of card.sizes ?? []) {
      const chrtId = Number(size.chrtID ?? size.chrtId ?? 0);
      if (!Number.isFinite(chrtId) || chrtId <= 0) continue;
      const techSize = String(size.techSize ?? size.wbSize ?? "").trim();
      const barcode = String(size.skus?.find(Boolean) ?? "").trim();
      map.set(chrtKey(nmId, chrtId), { techSize, barcode });
    }
  }
  return map;
}

function todayIsoDate(): string {
  // Local calendar date (server TZ). Orion ops run in seller-local / Moscow-aligned hosts.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function eachIsoDay(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function loadProductEnrichment(
  marketplaceAccountId: string
): Promise<Map<number, ProductEnrichment>> {
  const supabase = createAdminClient();
  const map = new Map<number, ProductEnrichment>();
  let from = 0;
  const page = 1000;

  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select("nm_id, supplier_article, barcode, brand:brands(name), category:categories(name)")
      .eq("marketplace_account_id", marketplaceAccountId)
      .range(from, from + page - 1);

    if (error) throw new Error(`Product enrichment failed: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      const nmId = Number(row.nm_id);
      if (!Number.isFinite(nmId) || nmId <= 0) continue;
      const brandRel = row.brand as { name?: string } | { name?: string }[] | null;
      const catRel = row.category as { name?: string } | { name?: string }[] | null;
      const brandName = Array.isArray(brandRel)
        ? brandRel[0]?.name ?? ""
        : brandRel?.name ?? "";
      const subjectName = Array.isArray(catRel)
        ? catRel[0]?.name ?? ""
        : catRel?.name ?? "";
      map.set(nmId, {
        sellerArticle: String(row.supplier_article ?? ""),
        brand: brandName,
        subject: subjectName,
        barcode: String(row.barcode ?? ""),
      });
    }
    if (data.length < page) break;
    from += page;
  }

  // Prefer variant barcode when product-level barcode is empty
  from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("nm_id, barcode")
      .eq("marketplace_account_id", marketplaceAccountId)
      .range(from, from + page - 1);
    if (error) break;
    if (!data?.length) break;
    for (const v of data) {
      const nmId = Number(v.nm_id);
      if (!Number.isFinite(nmId) || nmId <= 0) continue;
      const enrich = map.get(nmId);
      if (enrich && !enrich.barcode && v.barcode) {
        enrich.barcode = String(v.barcode);
      }
    }
    if (data.length < page) break;
    from += page;
  }

  return map;
}

/**
 * Analytics may return flat rows (current docs) or nest qty/transit under `warehouses[]`.
 * Flatten so inWayToClient / inWayFromClient are never dropped by shape drift.
 */
function flattenWarehouseStockItems(items: WbWarehouseStockItem[]): WbWarehouseStockItem[] {
  const out: WbWarehouseStockItem[] = [];
  for (const item of items) {
    const nested = item.warehouses;
    if (Array.isArray(nested) && nested.length > 0) {
      for (const wh of nested) {
        out.push({
          nmId: Number(wh.nmId ?? item.nmId),
          chrtId: Number(wh.chrtId ?? item.chrtId),
          warehouseId: wh.warehouseId ?? item.warehouseId,
          warehouseName: wh.warehouseName ?? item.warehouseName,
          regionName: wh.regionName ?? item.regionName,
          quantity: Number(wh.quantity ?? 0),
          inWayToClient: Number(wh.inWayToClient ?? item.inWayToClient ?? 0),
          inWayFromClient: Number(wh.inWayFromClient ?? item.inWayFromClient ?? 0),
        });
      }
      continue;
    }
    out.push({
      nmId: Number(item.nmId),
      chrtId: Number(item.chrtId),
      warehouseId: item.warehouseId,
      warehouseName: item.warehouseName,
      regionName: item.regionName,
      quantity: Number(item.quantity ?? 0),
      inWayToClient: Number(item.inWayToClient ?? 0),
      inWayFromClient: Number(item.inWayFromClient ?? 0),
    });
  }
  return out;
}

function mapStockItemToSnapshotRow(
  item: WbWarehouseStockItem,
  snapshotDate: string,
  marketplaceAccountId: number,
  enrichment: Map<number, ProductEnrichment>,
  chrtSizes: Map<string, ChrtSizeInfo>
): HistoricalInventorySnapshotInsert | null {
  const nmId = Number(item.nmId);
  if (!Number.isFinite(nmId) || nmId <= 0) return null;
  const warehouse = String(item.warehouseName ?? "").trim();
  if (!warehouse) return null;

  const meta = enrichment.get(nmId);
  const chrtId = Number(item.chrtId);
  const chrtMeta =
    Number.isFinite(chrtId) && chrtId > 0
      ? chrtSizes.get(chrtKey(nmId, chrtId))
      : undefined;

  // Prefer real tech size (XS/M/44). Fall back to chrt id only for uniqueness if unknown.
  const size =
    chrtMeta?.techSize ||
    (Number.isFinite(chrtId) && chrtId > 0 ? String(chrtId) : "");

  const barcode =
    chrtMeta?.barcode || meta?.barcode || "";

  return {
    snapshot_date: snapshotDate,
    marketplace_account_id: marketplaceAccountId,
    warehouse_name: warehouse,
    brand: meta?.brand ?? "",
    subject: meta?.subject ?? "",
    seller_article: meta?.sellerArticle ?? "",
    nm_id: nmId,
    barcode,
    size,
    quantity: Math.max(0, Math.round(Number(item.quantity ?? 0) || 0)),
    in_way_to_client: Math.max(0, Math.round(Number(item.inWayToClient ?? 0) || 0)),
    in_way_from_client: Math.max(
      0,
      Math.round(Number(item.inWayFromClient ?? 0) || 0)
    ),
  };
}

async function replaceSnapshotDay(
  marketplaceAccountId: string,
  snapshotDate: string,
  rows: HistoricalInventorySnapshotInsert[]
): Promise<number> {
  const supabase = createAdminClient();
  // Full day replace so size label corrections do not leave orphan chrt-id grains.
  const { error: delError } = await supabase
    .from("historical_inventory_snapshots")
    .delete()
    .eq("marketplace_account_id", marketplaceAccountId)
    .eq("snapshot_date", snapshotDate);
  if (delError) throw new Error(`Snapshot day delete failed: ${delError.message}`);
  return upsertSnapshotRows(rows);
}

async function upsertSnapshotRows(
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
      if (/in_way_to_client|in_way_from_client/i.test(error.message)) {
        throw new Error(
          `Snapshot upsert failed — transit columns missing or schema cache stale. ` +
            `Apply supabase/migrations/20260726160000_historical_inventory_snapshot_transit.sql ` +
            `(or apply-now-historical-inventory-transit.sql), reload PostgREST schema, then re-run. ` +
            `Original error: ${error.message}`
        );
      }
      throw new Error(`Snapshot upsert failed: ${error.message}`);
    }
    upserted += count ?? batch.length;
  }
  return upserted;
}

/** Admin read — scripts/sync have no user session (createServerClient would see 0 dates). */
async function listSnapshotDatesAdmin(marketplaceAccountId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const dates = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("historical_inventory_snapshots")
      .select("snapshot_date")
      .eq("marketplace_account_id", marketplaceAccountId)
      .order("snapshot_date", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      if (/does not exist|schema cache|Could not find/i.test(error.message)) return [];
      throw new Error(`Failed to list snapshot dates: ${error.message}`);
    }
    if (!data?.length) break;
    for (const row of data) dates.add(String(row.snapshot_date).slice(0, 10));
    if (data.length < pageSize || from > 200_000) break;
    from += pageSize;
  }
  return [...dates].sort((a, b) => b.localeCompare(a));
}

/**
 * Capture one day's inventory from WB Analytics stocks API into the warehouse.
 * Idempotent for (account, snapshot_date).
 */
export async function captureDailyInventorySnapshot(params: {
  marketplaceAccountId: string;
  snapshotDate?: string;
  trigger?: "manual" | "lifecycle" | "recover" | "scheduled";
  fillGaps?: boolean;
}): Promise<DailyInventorySnapshotResult> {
  const snapshotDate = params.snapshotDate ?? todayIsoDate();
  const trigger = params.trigger ?? "scheduled";
  const accountId = params.marketplaceAccountId;

  const auditId = await startWarehouseImportAudit({
    marketplaceAccountId: accountId,
    entity: "inventory",
    trigger,
    currentDataset: "wb-warehouses-stock",
    meta: { snapshotDate, mode: "daily_snapshot" },
  });

  await updateWarehouseEntityState({
    marketplaceAccountId: accountId,
    entity: "inventory",
    stage: "incremental_sync_active",
    currentDataset: "wb-warehouses-stock",
    markStarted: true,
    errorMessage: null,
  });

  try {
    const account = await getMarketplaceAccountForSync(accountId);
    const client = new WbApiClient(account.apiKey);
    const [rawItems, enrichment, cards] = await Promise.all([
      client.fetchWbWarehousesStock(),
      loadProductEnrichment(accountId),
      client.fetchAllProductCards().catch((err) => {
        syncLog("inventory-daily-snapshot", "product cards for size map failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return [] as Awaited<ReturnType<WbApiClient["fetchAllProductCards"]>>;
      }),
    ]);
    const items = flattenWarehouseStockItems(rawItems);
    const chrtSizes = buildChrtSizeMapFromCards(cards);

    const rows: HistoricalInventorySnapshotInsert[] = [];
    let skipped = 0;
    let apiToClient = 0;
    let apiFromClient = 0;
    for (const item of items) {
      apiToClient += Math.max(0, Math.round(Number(item.inWayToClient ?? 0) || 0));
      apiFromClient += Math.max(
        0,
        Math.round(Number(item.inWayFromClient ?? 0) || 0)
      );
      const row = mapStockItemToSnapshotRow(
        item,
        snapshotDate,
        Number(accountId),
        enrichment,
        chrtSizes
      );
      if (!row) {
        skipped += 1;
        continue;
      }
      rows.push(row);
    }

    const mappedTo = rows.reduce((a, r) => a + (r.in_way_to_client ?? 0), 0);
    const mappedFrom = rows.reduce((a, r) => a + (r.in_way_from_client ?? 0), 0);
    if ((apiToClient > 0 || apiFromClient > 0) && mappedTo + mappedFrom === 0) {
      throw new Error(
        `Transit mapping lost API values (API to=${apiToClient} from=${apiFromClient}, mapped 0). ` +
          `Check wb-warehouses response shape.`
      );
    }

    const upserted = await replaceSnapshotDay(accountId, snapshotDate, rows);

    let missingDatesDetected: string[] = [];
    const gapsFilled: string[] = [];

    if (params.fillGaps !== false) {
      missingDatesDetected = await detectMissingSnapshotDates(accountId);
      // Live API fills current snapshotDate only. Past gaps: local archive when present.
      if (upserted > 0) gapsFilled.push(snapshotDate);
      const pastMissing = missingDatesDetected.filter((d) => d !== snapshotDate);
      if (pastMissing.length) {
        const fromArchive = await fillMissingDatesFromArchives(accountId, pastMissing);
        gapsFilled.push(...fromArchive);
        missingDatesDetected = await detectMissingSnapshotDates(accountId);
      }
    }

    const existingDates = await listSnapshotDatesAdmin(accountId);

    await updateWarehouseEntityState({
      marketplaceAccountId: accountId,
      entity: "inventory",
      stage: upserted > 0 ? "healthy" : "failed",
      progress: {
        snapshotDates: existingDates,
        lastWindow: snapshotDate,
        source: "wb-warehouses-stock",
        missingDates: missingDatesDetected,
      },
      currentDataset: `daily:${snapshotDate}`,
      markSuccessfulSync: upserted > 0,
      markFailedSync: upserted === 0,
      markCompleted: upserted > 0,
      errorMessage:
        upserted > 0
          ? null
          : "Daily snapshot produced zero rows — check Analytics token / stocks API",
    });

    await finishWarehouseImportAudit({
      auditId,
      status: upserted > 0 ? "success" : "failed",
      recordsRead: items.length,
      rowsInserted: upserted,
      rowsUpdated: 0,
      rowsSkipped: skipped,
      validationResult: upserted > 0 ? "PASS" : "FAIL",
      errors:
        upserted > 0
          ? []
          : ["Zero rows upserted into historical_inventory_snapshots"],
      currentDataset: `daily:${snapshotDate}`,
      meta: {
        snapshotDate,
        missingDatesDetected,
        gapsFilled,
        existingDateCount: existingDates.length,
      },
    });

    syncLog("inventory-daily-snapshot", "capture complete", {
      accountId,
      snapshotDate,
      recordsRead: items.length,
      upserted,
      skipped,
      transitToClient: mappedTo,
      transitFromClient: mappedFrom,
    });

    return {
      marketplaceAccountId: accountId,
      snapshotDate,
      status: upserted > 0 ? "success" : "failed",
      recordsRead: items.length,
      rowsUpserted: upserted,
      rowsSkipped: skipped,
      missingDatesDetected,
      gapsFilled,
      message:
        upserted > 0
          ? `Daily snapshot ${snapshotDate}: ${upserted} rows (toCustomer=${mappedTo}, fromCustomer=${mappedFrom})`
          : `Daily snapshot ${snapshotDate} failed — no rows`,
      auditId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishWarehouseImportAudit({
      auditId,
      status: "failed",
      validationResult: "FAIL",
      errors: [message],
      currentDataset: `daily:${snapshotDate}`,
    });
    await updateWarehouseEntityState({
      marketplaceAccountId: accountId,
      entity: "inventory",
      stage: "failed",
      errorMessage: message,
      markFailedSync: true,
      bumpRetry: true,
    });
    return {
      marketplaceAccountId: accountId,
      snapshotDate,
      status: "failed",
      recordsRead: 0,
      rowsUpserted: 0,
      rowsSkipped: 0,
      missingDatesDetected: [],
      gapsFilled: [],
      message,
      auditId,
    };
  }
}

/** Dates between first known snapshot and today that have no rows. */
export async function detectMissingSnapshotDates(
  marketplaceAccountId: string
): Promise<string[]> {
  const dates = await listSnapshotDatesAdmin(marketplaceAccountId);
  if (!dates.length) return [todayIsoDate()];

  const newest = dates[0];
  const oldest = dates[dates.length - 1];
  const today = todayIsoDate();
  const end = today > newest ? today : newest;
  const expected = eachIsoDay(oldest, end);
  const have = new Set(dates);
  return expected.filter((d) => !have.has(d));
}

/**
 * Fill past missing dates from local STOCK_HISTORY archives when available.
 * Does not call Wildberries. Never blocks daily sync on archive miss.
 * Never writes "today" — STOCK_HISTORY has no transit fields; today must come from Analytics.
 */
async function fillMissingDatesFromArchives(
  marketplaceAccountId: string,
  missingDates: string[]
): Promise<string[]> {
  const today = todayIsoDate();
  const pastOnly = missingDates.filter((d) => d < today);
  if (!pastOnly.length) return [];
  const accountId = Number(marketplaceAccountId);
  const accountDir = join(DEFAULT_ARCHIVE_ROOT, `account-${accountId}`);
  if (!existsSync(accountDir)) return [];

  const want = new Set(pastOnly);
  let rows: HistoricalInventorySnapshotInsert[] = [];

  const widePath = join(accountDir, "_source", "STOCK_HISTORY_DAILY_wide.csv");
  if (existsSync(widePath)) {
    rows = parseHistoricalWideCsv(readFileSync(widePath, "utf8"), accountId).filter((r) =>
      want.has(r.snapshot_date)
    );
  } else {
    for (const date of pastOnly) {
      const raw = join(accountDir, date, "raw.csv");
      if (!existsSync(raw)) continue;
      rows.push(...parseHistoricalDayRawCsv(readFileSync(raw, "utf8"), accountId, date));
    }
  }

  if (!rows.length) return [];
  await upsertSnapshotRows(rows);
  const filled = [...new Set(rows.map((r) => r.snapshot_date))];
  syncLog("inventory-daily-snapshot", "archive gap fill", {
    marketplaceAccountId,
    filled,
  });
  return filled;
}

/**
 * Run daily snapshot for all operational WB accounts (one at a time).
 */
export async function captureDailyInventorySnapshotForAllAccounts(params?: {
  snapshotDate?: string;
  trigger?: "manual" | "scheduled" | "recover";
}): Promise<DailyInventorySnapshotResult[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marketplace_accounts")
    .select("id, account_name, marketplace, is_active")
    .eq("marketplace", "wildberries")
    .eq("is_active", true)
    .order("id");

  if (error) throw new Error(error.message);
  const accounts = filterOperationalMarketplaceAccounts(data ?? []);
  const results: DailyInventorySnapshotResult[] = [];

  for (const account of accounts) {
    const result = await captureDailyInventorySnapshot({
      marketplaceAccountId: String(account.id),
      snapshotDate: params?.snapshotDate,
      trigger: params?.trigger ?? "scheduled",
      fillGaps: true,
    });
    results.push(result);
  }

  return results;
}

/** Fire-and-forget after dashboard sync (does not block sync success). */
export function scheduleDailyInventorySnapshot(marketplaceAccountId: string): void {
  void captureDailyInventorySnapshot({
    marketplaceAccountId,
    trigger: "scheduled",
    fillGaps: true,
  }).catch((err) => {
    syncLog("inventory-daily-snapshot", "scheduled capture failed", {
      marketplaceAccountId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
