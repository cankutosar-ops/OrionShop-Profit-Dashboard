/**
 * Sprint 11.2 — Inventory History pivot table model.
 * Single table; grouping follows lowest visible product hierarchy via Table Settings.
 */

export type HistoryTableSettings = {
  brand: boolean;
  category: boolean;
  model: boolean;
  barcode: boolean;
  size: boolean;
  total: boolean;
  toCustomer: boolean;
  fromCustomer: boolean;
};

export const DEFAULT_HISTORY_TABLE_SETTINGS: HistoryTableSettings = {
  brand: true,
  category: true,
  model: true,
  barcode: true,
  size: true,
  total: true,
  toCustomer: true,
  fromCustomer: true,
};

const SETTINGS_STORAGE_KEY = "inventory-history-table-settings-v1";

/** Product hierarchy for aggregation (barcode is display-only, not a group level). */
export const HISTORY_HIERARCHY = ["brand", "category", "model", "size"] as const;
export type HistoryHierarchyKey = (typeof HISTORY_HIERARCHY)[number];

export type HistoryFlatRow = {
  brand: string;
  subject: string;
  seller_article: string;
  barcode: string;
  size: string;
  warehouse_name: string;
  quantity: number;
  in_way_to_client: number;
  in_way_from_client: number;
  nm_id?: number;
};

export type HistoryPivotRow = {
  key: string;
  brand: string;
  category: string;
  model: string;
  barcode: string;
  size: string;
  total: number;
  toCustomer: number;
  fromCustomer: number;
  /** quantity by raw warehouse_name */
  byWarehouse: Record<string, number>;
};

export type HistorySortKey =
  | "brand"
  | "category"
  | "model"
  | "barcode"
  | "size"
  | "total"
  | "toCustomer"
  | "fromCustomer"
  | `wh:${string}`;

type HistoryTextSortKey = "brand" | "category" | "model" | "barcode" | "size";

function isHistoryTextSortKey(sortKey: HistorySortKey): sortKey is HistoryTextSortKey {
  return (
    sortKey === "brand" ||
    sortKey === "category" ||
    sortKey === "model" ||
    sortKey === "barcode" ||
    sortKey === "size"
  );
}

export function loadHistoryTableSettings(): HistoryTableSettings {
  if (typeof window === "undefined") return { ...DEFAULT_HISTORY_TABLE_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_HISTORY_TABLE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<HistoryTableSettings>;
    return { ...DEFAULT_HISTORY_TABLE_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_HISTORY_TABLE_SETTINGS };
  }
}

export function saveHistoryTableSettings(settings: HistoryTableSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}

function settingsFlag(settings: HistoryTableSettings, key: HistoryHierarchyKey): boolean {
  if (key === "category") return settings.category;
  if (key === "model") return settings.model;
  return settings[key];
}

/** Lowest visible hierarchy key; null when all hierarchy columns hidden. */
export function resolveGroupingLevel(
  settings: HistoryTableSettings
): HistoryHierarchyKey | null {
  let lowest: HistoryHierarchyKey | null = null;
  for (const key of HISTORY_HIERARCHY) {
    if (settingsFlag(settings, key)) lowest = key;
  }
  return lowest;
}

function identityValue(row: HistoryFlatRow, key: HistoryHierarchyKey): string {
  switch (key) {
    case "brand":
      return row.brand || "";
    case "category":
      return row.subject || "";
    case "model":
      return row.seller_article || "";
    case "size":
      return row.size || "";
  }
}

/**
 * Group key = all hierarchy levels from Brand down through the lowest visible level.
 * Hidden levels below the lowest are collapsed; levels above stay in the key when visible.
 */
export function buildGroupKey(
  row: HistoryFlatRow,
  settings: HistoryTableSettings
): string {
  const level = resolveGroupingLevel(settings);
  if (!level) return "__all__";

  const parts: string[] = [];
  for (const key of HISTORY_HIERARCHY) {
    if (!settingsFlag(settings, key)) {
      // Still include higher levels that are visible; skip hidden
      continue;
    }
    parts.push(`${key}=${identityValue(row, key)}`);
    if (key === level) break;
  }
  // When size visible, barcode distinguishes SKUs with same size text if shown
  if (settings.size && settings.barcode) {
    parts.push(`barcode=${row.barcode || ""}`);
  }
  return parts.join("|") || "__all__";
}

export function pivotHistoryRows(
  rows: HistoryFlatRow[],
  settings: HistoryTableSettings,
  warehouseFilter?: string
): { pivotRows: HistoryPivotRow[]; warehouses: string[] } {
  const source = warehouseFilter
    ? rows.filter((r) => r.warehouse_name === warehouseFilter)
    : rows;

  const warehouseSet = new Set<string>();
  for (const r of source) {
    if (r.warehouse_name) warehouseSet.add(r.warehouse_name);
  }
  const warehouses = [...warehouseSet].sort((a, b) => a.localeCompare(b, "ru"));

  const map = new Map<string, HistoryPivotRow>();

  for (const r of source) {
    const key = buildGroupKey(r, settings);
    let pivot = map.get(key);
    if (!pivot) {
      const level = resolveGroupingLevel(settings);
      pivot = {
        key,
        brand: settings.brand ? r.brand || "" : "",
        category: settings.category ? r.subject || "" : "",
        model: settings.model ? r.seller_article || "" : "",
        barcode: settings.barcode && settings.size ? r.barcode || "" : "",
        size: settings.size ? r.size || "" : "",
        total: 0,
        toCustomer: 0,
        fromCustomer: 0,
        byWarehouse: {},
      };
      // When aggregating above a level, clear lower identity fields
      if (!settings.brand) pivot.brand = "";
      if (!settings.category) pivot.category = "";
      if (!settings.model) pivot.model = "";
      if (!settings.size) {
        pivot.size = "";
        if (!settings.barcode) pivot.barcode = "";
        else {
          // Model-level barcode is ambiguous when sizes rolled up
          pivot.barcode = level === "size" ? r.barcode || "" : "";
        }
      }
      map.set(key, pivot);
    }

    const qty = Math.max(0, Number(r.quantity) || 0);
    const toC = Math.max(0, Number(r.in_way_to_client) || 0);
    const fromC = Math.max(0, Number(r.in_way_from_client) || 0);
    pivot.total += qty;
    pivot.toCustomer += toC;
    pivot.fromCustomer += fromC;
    const wh = r.warehouse_name || "";
    if (wh) pivot.byWarehouse[wh] = (pivot.byWarehouse[wh] ?? 0) + qty;
  }

  return { pivotRows: [...map.values()], warehouses };
}

export function sortPivotRows(
  rows: HistoryPivotRow[],
  sortBy: HistorySortKey,
  sortDir: "asc" | "desc"
): HistoryPivotRow[] {
  const dir = sortDir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortBy.startsWith("wh:")) {
      const wh = sortBy.slice(3);
      cmp = (a.byWarehouse[wh] ?? 0) - (b.byWarehouse[wh] ?? 0);
    } else if (sortBy === "total" || sortBy === "toCustomer" || sortBy === "fromCustomer") {
      cmp = (a[sortBy] ?? 0) - (b[sortBy] ?? 0);
    } else if (isHistoryTextSortKey(sortBy)) {
      const av = String(a[sortBy] ?? "").toLowerCase();
      const bv = String(b[sortBy] ?? "").toLowerCase();
      cmp = av.localeCompare(bv, "ru");
    }
    if (cmp) return cmp * dir;
    return a.key.localeCompare(b.key);
  });
}

export function matchesPivotSearch(row: HistoryPivotRow, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    row.brand.toLowerCase().includes(needle) ||
    row.category.toLowerCase().includes(needle) ||
    row.model.toLowerCase().includes(needle) ||
    row.barcode.toLowerCase().includes(needle) ||
    row.size.toLowerCase().includes(needle)
  );
}

/** Looks like a WB chrtId stored as size — never show these in the UI. */
export function isInternalSizeId(size: string): boolean {
  return /^\d{6,}$/.test(String(size ?? "").trim());
}

export function displaySizeLabel(size: string): string {
  const s = String(size ?? "").trim();
  if (!s || isInternalSizeId(s)) return "";
  return s;
}

type TransitAvailabilityRow = {
  barcode?: string | null;
  in_way_to_client?: number | null;
  in_way_from_client?: number | null;
};

/**
 * STOCK_HISTORY_DAILY CSV never includes barcodes or inWay* fields (always 0).
 * Analytics daily snapshots include barcodes and/or real transit quantities.
 * Used to confirm Latest is a live snapshot before showing transit columns.
 */
export function isTransitAvailableForSnapshot(rows: TransitAvailabilityRow[]): boolean {
  if (!rows.length) return false;
  return rows.some((r) => {
    if (String(r.barcode ?? "").trim()) return true;
    if (Number(r.in_way_to_client) > 0) return true;
    if (Number(r.in_way_from_client) > 0) return true;
    return false;
  });
}

export type HistoryExportColumn = {
  header: string;
  value: (row: HistoryPivotRow) => string | number;
};

export function buildVisibleExportColumns(
  settings: HistoryTableSettings,
  warehouses: string[],
  formatWarehouse: (name: string) => string,
  options?: { includeTransitColumns?: boolean }
): HistoryExportColumn[] {
  const includeTransit = options?.includeTransitColumns === true;
  const cols: HistoryExportColumn[] = [];
  if (settings.brand) cols.push({ header: "Brand", value: (r) => r.brand });
  if (settings.category) cols.push({ header: "Category", value: (r) => r.category });
  if (settings.model) cols.push({ header: "Model", value: (r) => r.model });
  if (settings.barcode) cols.push({ header: "Barcode", value: (r) => r.barcode });
  if (settings.size) {
    cols.push({ header: "Size", value: (r) => displaySizeLabel(r.size) });
  }
  if (settings.total) cols.push({ header: "Total", value: (r) => r.total });
  if (includeTransit && settings.toCustomer) {
    cols.push({ header: "To Customer", value: (r) => r.toCustomer });
  }
  if (includeTransit && settings.fromCustomer) {
    cols.push({ header: "From Customer", value: (r) => r.fromCustomer });
  }
  for (const wh of warehouses) {
    cols.push({
      header: formatWarehouse(wh),
      value: (r) => r.byWarehouse[wh] ?? 0,
    });
  }
  return cols;
}

export function pivotRowsToExportRecords(
  rows: HistoryPivotRow[],
  columns: HistoryExportColumn[]
): Record<string, string | number>[] {
  return rows.map((row) => {
    const rec: Record<string, string | number> = {};
    for (const col of columns) {
      rec[col.header] = col.value(row);
    }
    return rec;
  });
}
