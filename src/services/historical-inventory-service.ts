/**
 * Sprint 10 — Historical Inventory query service (one snapshot at a time).
 *
 * Reads use the service-role admin client. The anon server client cannot see
 * rows when RLS is on / PostgREST cache is stale — which produced empty
 * "No inventory dates" despite data in historical_inventory_snapshots.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isInternalSizeId } from "@/lib/inventory-history-table";
import { mergeWarehouseNameLists } from "@/lib/warehouse-locations";
import type {
  HistoricalInventoryPage,
  HistoricalInventoryQuery,
  HistoricalInventorySnapshot,
  HistoricalInventorySortField,
} from "@/lib/historical-inventory-types";
import { WbApiClient } from "@/lib/wildberries/api-client";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import { listWarehouseLocationNames } from "@/services/warehouse-location-service";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 5_000;

const SORT_COLUMNS: HistoricalInventorySortField[] = [
  "brand",
  "subject",
  "seller_article",
  "nm_id",
  "barcode",
  "size",
  "warehouse_name",
  "quantity",
];

function clampPageSize(n: number | undefined): number {
  if (!n || !Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}

function historyClient() {
  return createAdminClient();
}

function normalizeSnapshotRow(row: HistoricalInventorySnapshot): HistoricalInventorySnapshot {
  return {
    ...row,
    in_way_to_client: Number(row.in_way_to_client ?? 0) || 0,
    in_way_from_client: Number(row.in_way_from_client ?? 0) || 0,
  };
}

/**
 * Replace internal chrt size ids with techSize for display / pivot.
 * Uses product_variants (barcode) first; Content cards when still unresolved.
 */
async function resolveDisplaySizes(
  marketplaceAccountId: string,
  rows: HistoricalInventorySnapshot[]
): Promise<HistoricalInventorySnapshot[]> {
  if (!rows.some((r) => isInternalSizeId(r.size))) {
    return rows.map(normalizeSnapshotRow);
  }

  const supabase = historyClient();
  const barcodeToSize = new Map<string, string>();
  const nmToSizes = new Map<number, string[]>();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("nm_id, tech_size, barcode")
      .eq("marketplace_account_id", marketplaceAccountId)
      .range(from, from + page - 1);
    if (error || !data?.length) break;
    for (const v of data) {
      const tech = String(v.tech_size ?? "").trim();
      if (!tech || isInternalSizeId(tech)) continue;
      if (v.barcode) barcodeToSize.set(String(v.barcode), tech);
      const nmId = Number(v.nm_id);
      if (Number.isFinite(nmId) && nmId > 0) {
        const list = nmToSizes.get(nmId) ?? [];
        if (!list.includes(tech)) list.push(tech);
        nmToSizes.set(nmId, list);
      }
    }
    if (data.length < page) break;
    from += page;
  }

  const chrtToSize = new Map<string, string>();
  const stillNeedCards = rows.some((r) => {
    if (!isInternalSizeId(r.size)) return false;
    if (r.barcode && barcodeToSize.has(r.barcode)) return false;
    const only = nmToSizes.get(r.nm_id);
    return !(only && only.length === 1);
  });

  if (stillNeedCards) {
    try {
      const account = await getMarketplaceAccountForSync(marketplaceAccountId);
      const cards = await new WbApiClient(account.apiKey).fetchAllProductCards();
      for (const card of cards) {
        const nmId = Number(card.nmID);
        for (const size of card.sizes ?? []) {
          const chrtId = Number(size.chrtID ?? size.chrtId ?? 0);
          const tech = String(size.techSize ?? size.wbSize ?? "").trim();
          if (!nmId || !chrtId || !tech || isInternalSizeId(tech)) continue;
          chrtToSize.set(`${nmId}:${chrtId}`, tech);
          const sku = size.skus?.find(Boolean);
          if (sku) barcodeToSize.set(String(sku), tech);
        }
      }
    } catch {
      /* keep barcode / single-size fallbacks */
    }
  }

  return rows.map((row) => {
    const base = normalizeSnapshotRow(row);
    if (!isInternalSizeId(base.size)) return base;

    let size = "";
    if (base.barcode && barcodeToSize.has(base.barcode)) {
      size = barcodeToSize.get(base.barcode)!;
    } else {
      const fromChrt = chrtToSize.get(`${base.nm_id}:${base.size}`);
      if (fromChrt) size = fromChrt;
      else {
        const only = nmToSizes.get(base.nm_id);
        if (only?.length === 1) size = only[0];
      }
    }
    // Never surface raw chrt ids — empty if unresolved
    return { ...base, size };
  });
}

export async function listAvailableSnapshotDates(
  marketplaceAccountId: string
): Promise<string[]> {
  const supabase = historyClient();
  const accountId = Number(marketplaceAccountId);
  const dates = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("historical_inventory_snapshots")
      .select("snapshot_date")
      .eq("marketplace_account_id", accountId)
      .order("snapshot_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      if (/does not exist|schema cache|Could not find/i.test(error.message)) {
        return [];
      }
      throw new Error(`Failed to list snapshot dates: ${error.message}`);
    }
    if (!data?.length) break;
    for (const row of data) {
      dates.add(String(row.snapshot_date).slice(0, 10));
    }
    if (data.length < pageSize || from > 200_000) break;
    from += pageSize;
  }

  return [...dates].sort((a, b) => b.localeCompare(a));
}

export async function listWarehousesForSnapshot(
  marketplaceAccountId: string,
  snapshotDate: string
): Promise<string[]> {
  const supabase = historyClient();
  const accountId = Number(marketplaceAccountId);
  const { data, error } = await supabase
    .from("historical_inventory_snapshots")
    .select("warehouse_name")
    .eq("marketplace_account_id", accountId)
    .eq("snapshot_date", snapshotDate)
    .limit(10000);

  if (error) throw new Error(`Failed to list warehouses: ${error.message}`);
  const snapshotNames = [...new Set((data ?? []).map((r) => String(r.warehouse_name || "")))]
    .filter(Boolean);

  // Union with account Warehouse Locations (stock + sales + orders) so FBS
  // shipping locations appear as peers even when absent from this snapshot day.
  let catalogNames: string[] = [];
  try {
    catalogNames = await listWarehouseLocationNames(marketplaceAccountId, {
      activeOnly: true,
      client: supabase,
    });
  } catch {
    catalogNames = [];
  }

  return mergeWarehouseNameLists(snapshotNames, catalogNames);
}

/**
 * Query a single account + snapshot_date page. Never scans other dates.
 */
export async function queryHistoricalInventorySnapshot(
  query: HistoricalInventoryQuery
): Promise<HistoricalInventoryPage> {
  const supabase = historyClient();
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = clampPageSize(query.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const sortBy = SORT_COLUMNS.includes(query.sortBy as HistoricalInventorySortField)
    ? (query.sortBy as HistoricalInventorySortField)
    : "warehouse_name";
  const ascending = (query.sortDir ?? "asc") !== "desc";
  const accountId = Number(query.marketplaceAccountId);

  let q = supabase
    .from("historical_inventory_snapshots")
    .select("*", { count: "exact" })
    .eq("marketplace_account_id", accountId)
    .eq("snapshot_date", query.snapshotDate);

  if (query.warehouse?.trim()) {
    q = q.eq("warehouse_name", query.warehouse.trim());
  }

  const search = query.search?.trim();
  if (search) {
    // PostgREST or() — ilike across text fields; nm_id exact if numeric
    const safe = search.replace(/[%_,]/g, "");
    const nm = Number(safe);
    if (Number.isFinite(nm) && /^\d+$/.test(safe)) {
      q = q.or(
        `nm_id.eq.${nm},seller_article.ilike.%${safe}%,brand.ilike.%${safe}%,subject.ilike.%${safe}%,warehouse_name.ilike.%${safe}%,size.ilike.%${safe}%,barcode.ilike.%${safe}%`
      );
    } else {
      q = q.or(
        `seller_article.ilike.%${safe}%,brand.ilike.%${safe}%,subject.ilike.%${safe}%,warehouse_name.ilike.%${safe}%,size.ilike.%${safe}%,barcode.ilike.%${safe}%`
      );
    }
  }

  q = q.order(sortBy, { ascending }).order("nm_id", { ascending: true }).range(from, to);

  const { data, error, count } = await q;
  if (error) {
    if (/does not exist|schema cache|Could not find/i.test(error.message)) {
      return {
        snapshotDate: query.snapshotDate,
        marketplaceAccountId: query.marketplaceAccountId,
        rows: [],
        total: 0,
        page,
        pageSize,
        warehouses: [],
        availableDates: [],
      };
    }
    throw new Error(`Historical inventory query failed: ${error.message}`);
  }

  const [warehouses, availableDates] = await Promise.all([
    listWarehousesForSnapshot(query.marketplaceAccountId, query.snapshotDate),
    listAvailableSnapshotDates(query.marketplaceAccountId),
  ]);

  return {
    snapshotDate: query.snapshotDate,
    marketplaceAccountId: query.marketplaceAccountId,
    rows: await resolveDisplaySizes(
      query.marketplaceAccountId,
      (data ?? []) as HistoricalInventorySnapshot[]
    ),
    total: count ?? 0,
    page,
    pageSize,
    warehouses,
    availableDates,
  };
}

/**
 * Load an entire single-day snapshot (account + date only). No search/warehouse filter.
 * Used by Inventory History UI for client-side filter/search/sort.
 */
export async function loadFullHistoricalInventorySnapshot(params: {
  marketplaceAccountId: string;
  snapshotDate: string;
}): Promise<HistoricalInventoryPage> {
  const supabase = historyClient();
  const accountId = Number(params.marketplaceAccountId);
  const pageSize = 1000;
  const rows: HistoricalInventorySnapshot[] = [];
  let from = 0;

  const [availableDates, warehouses] = await Promise.all([
    listAvailableSnapshotDates(params.marketplaceAccountId),
    listWarehousesForSnapshot(params.marketplaceAccountId, params.snapshotDate),
  ]);

  for (;;) {
    const { data, error } = await supabase
      .from("historical_inventory_snapshots")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .eq("snapshot_date", params.snapshotDate)
      .order("warehouse_name", { ascending: true })
      .order("nm_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      if (/does not exist|schema cache|Could not find/i.test(error.message)) {
        return {
          snapshotDate: params.snapshotDate,
          marketplaceAccountId: params.marketplaceAccountId,
          rows: [],
          total: 0,
          page: 1,
          pageSize,
          warehouses: [],
          availableDates: [],
        };
      }
      throw new Error(`Historical inventory query failed: ${error.message}`);
    }

    if (!data?.length) break;
    rows.push(
      ...(data as HistoricalInventorySnapshot[]).map((r) => normalizeSnapshotRow(r))
    );
    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 100_000) break;
  }

  const resolved = await resolveDisplaySizes(params.marketplaceAccountId, rows);

  return {
    snapshotDate: params.snapshotDate,
    marketplaceAccountId: params.marketplaceAccountId,
    rows: resolved,
    total: resolved.length,
    page: 1,
    pageSize: resolved.length || pageSize,
    warehouses,
    availableDates,
  };
}

/** All matching rows for Excel export of one snapshot (+ optional filters). */
export async function fetchHistoricalInventoryForExport(
  query: Omit<HistoricalInventoryQuery, "page" | "pageSize">,
  maxRows = 50_000
): Promise<HistoricalInventorySnapshot[]> {
  const pageSize = 1000;
  const rows: HistoricalInventorySnapshot[] = [];
  let page = 1;
  while (rows.length < maxRows) {
    const result = await queryHistoricalInventorySnapshot({
      ...query,
      page,
      pageSize,
    });
    rows.push(...result.rows);
    if (rows.length >= result.total || result.rows.length === 0) break;
    page += 1;
  }
  return rows.slice(0, maxRows);
}
