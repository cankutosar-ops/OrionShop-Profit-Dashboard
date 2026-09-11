"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Settings2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { cn, formatNumber } from "@/lib/utils";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { formatWarehouseName } from "@/lib/warehouse-name-aliases";
import { WarehouseLocationSelect } from "@/components/inventory/warehouse-location-select";
import type { HistoricalInventorySnapshot } from "@/lib/historical-inventory-types";
import {
  mergeWarehouseNameLists,
} from "@/lib/warehouse-locations";
import {
  buildVisibleExportColumns,
  DEFAULT_HISTORY_TABLE_SETTINGS,
  displaySizeLabel,
  isTransitAvailableForSnapshot,
  loadHistoryTableSettings,
  matchesPivotSearch,
  pivotHistoryRows,
  pivotRowsToExportRecords,
  saveHistoryTableSettings,
  sortPivotRows,
  type HistoryPivotRow,
  type HistorySortKey,
  type HistoryTableSettings,
} from "@/lib/inventory-history-table";

type AccountOption = { id: string; account_name: string };

type InventoryHistoryWorkspaceProps = {
  accounts: AccountOption[];
  initialAccountId: string | null;
};

const PAGE_SIZE = 100;

const HISTORY_DEFAULT_SORT = { key: "model" as const, direction: "asc" as const };

const SETTINGS_LABELS: Array<{ key: keyof HistoryTableSettings; label: string }> = [
  { key: "brand", label: "Brand" },
  { key: "category", label: "Category" },
  { key: "model", label: "Model" },
  { key: "barcode", label: "Barcode" },
  { key: "size", label: "Size" },
  { key: "total", label: "Total" },
  { key: "toCustomer", label: "To Customer" },
  { key: "fromCustomer", label: "From Customer" },
];

const TRANSIT_SETTING_KEYS = new Set<keyof HistoryTableSettings>([
  "toCustomer",
  "fromCustomer",
]);

function formatInventoryDate(iso: string, latest: boolean): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const label = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return latest ? `${label} (Latest)` : label;
}

function toFlatRow(row: HistoricalInventorySnapshot) {
  return {
    brand: row.brand || "",
    subject: row.subject || "",
    seller_article: row.seller_article || "",
    barcode: row.barcode || "",
    size: displaySizeLabel(row.size),
    warehouse_name: row.warehouse_name || "",
    quantity: Number(row.quantity) || 0,
    in_way_to_client: Number(row.in_way_to_client ?? 0) || 0,
    in_way_from_client: Number(row.in_way_from_client ?? 0) || 0,
    nm_id: row.nm_id,
  };
}

export function InventoryHistoryWorkspace({
  accounts,
  initialAccountId,
}: InventoryHistoryWorkspaceProps) {
  const [accountId, setAccountId] = useState(
    initialAccountId ?? accounts[0]?.id ?? ""
  );
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [snapshotDate, setSnapshotDate] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const deferredSearch = useDeferredValue(searchInput);
  const [page, setPage] = useState(1);
  const { sort, onSort, directionFor, isActive } =
    useCycleSort<HistorySortKey>(HISTORY_DEFAULT_SORT);
  const [rows, setRows] = useState<HistoricalInventorySnapshot[]>([]);
  const [warehouseNames, setWarehouseNames] = useState<string[]>([]);
  const [datesLoaded, setDatesLoaded] = useState(false);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [tableSettings, setTableSettings] = useState<HistoryTableSettings>(
    DEFAULT_HISTORY_TABLE_SETTINGS
  );
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  useEffect(() => {
    setTableSettings(loadHistoryTableSettings());
    setSettingsHydrated(true);
  }, []);

  useEffect(() => {
    if (!settingsHydrated) return;
    saveHistoryTableSettings(tableSettings);
  }, [tableSettings, settingsHydrated]);

  useEffect(() => {
    if (!settingsOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [settingsOpen]);

  const loadDates = useCallback(async (acct: string) => {
    if (!acct) return;
    setDatesLoaded(false);
    const res = await fetch(
      `/api/inventory/history?marketplaceAccountId=${encodeURIComponent(acct)}&datesOnly=1`
    );
    const json = await res.json();
    if (!res.ok) {
      const msg = String(json.error || "Failed to load dates");
      if (/does not exist|schema cache|Could not find/i.test(msg)) {
        setAvailableDates([]);
        setSnapshotDate("");
        setDatesLoaded(true);
        return;
      }
      throw new Error(msg);
    }
    const dates: string[] = json.availableDates ?? [];
    setAvailableDates(dates);
    setSnapshotDate((prev) => (prev && dates.includes(prev) ? prev : dates[0] ?? ""));
    setDatesLoaded(true);
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (!accountId || !snapshotDate) {
      setRows([]);
      setWarehouseNames([]);
      setSnapshotLoaded(true);
      return;
    }
    setError(null);
    setSnapshotLoaded(false);
    const params = new URLSearchParams({
      marketplaceAccountId: accountId,
      snapshotDate,
      full: "1",
    });
    const res = await fetch(`/api/inventory/history?${params}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load inventory");
    setRows((json.rows ?? []) as HistoricalInventorySnapshot[]);
    setWarehouseNames(
      Array.isArray(json.warehouses) ? (json.warehouses as string[]) : []
    );
    if (json.availableDates?.length) setAvailableDates(json.availableDates);
    setSnapshotLoaded(true);
  }, [accountId, snapshotDate]);

  useEffect(() => {
    if (!accountId) return;
    startTransition(() => {
      loadDates(accountId).catch((e) =>
        setError(e instanceof Error ? e.message : String(e))
      );
    });
  }, [accountId, loadDates]);

  useEffect(() => {
    if (!accountId || !snapshotDate) {
      setRows([]);
      setWarehouseNames([]);
      return;
    }
    startTransition(() => {
      loadSnapshot().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    });
  }, [accountId, snapshotDate, loadSnapshot]);

  const warehouseOptions = useMemo(() => {
    const fromRows: string[] = [];
    for (const r of rows) {
      if (r.warehouse_name) fromRows.push(r.warehouse_name);
    }
    return mergeWarehouseNameLists(warehouseNames, fromRows);
  }, [rows, warehouseNames]);

  const { pivotRows, warehouses: pivotWarehouses } = useMemo(() => {
    const flat = rows.map(toFlatRow);
    return pivotHistoryRows(flat, tableSettings, warehouse || undefined);
  }, [rows, tableSettings, warehouse]);

  const transitAvailable = useMemo(
    () => isTransitAvailableForSnapshot(rows),
    [rows]
  );

  /** Transit columns only for Latest + live Analytics snapshot (not CSV history). */
  const showTransitColumns = useMemo(() => {
    const isLatest = Boolean(snapshotDate && availableDates[0] === snapshotDate);
    return isLatest && transitAvailable;
  }, [snapshotDate, availableDates, transitAvailable]);

  const visibleSettingsLabels = useMemo(
    () =>
      SETTINGS_LABELS.filter(
        ({ key }) => showTransitColumns || !TRANSIT_SETTING_KEYS.has(key)
      ),
    [showTransitColumns]
  );

  const appliedSort = useMemo(() => {
    if (!sort) return HISTORY_DEFAULT_SORT;
    if (
      !showTransitColumns &&
      (sort.key === "toCustomer" || sort.key === "fromCustomer")
    ) {
      return HISTORY_DEFAULT_SORT;
    }
    return sort;
  }, [sort, showTransitColumns]);

  const filteredSorted = useMemo(() => {
    const q = deferredSearch.trim();
    const filtered = q
      ? pivotRows.filter((r) => matchesPivotSearch(r, q))
      : pivotRows;
    if (!appliedSort) return filtered;
    return sortPivotRows(filtered, appliedSort.key, appliedSort.direction);
  }, [pivotRows, deferredSearch, appliedSort]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return filteredSorted.slice(start, start + PAGE_SIZE);
  }, [filteredSorted, pageSafe]);

  useEffect(() => {
    setPage(1);
  }, [warehouse, deferredSearch, appliedSort, snapshotDate, accountId, tableSettings]);

  function setSetting(key: keyof HistoryTableSettings, value: boolean) {
    setTableSettings((prev) => ({ ...prev, [key]: value }));
  }

  function exportFilteredExcel() {
    const columns = buildVisibleExportColumns(
      tableSettings,
      pivotWarehouses,
      formatWarehouseName,
      { includeTransitColumns: showTransitColumns }
    );
    const data = pivotRowsToExportRecords(filteredSorted, columns);
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `inventory-${accountId}-${snapshotDate}.xlsx`);
  }

  const identityHeaders: Array<{
    key: HistorySortKey;
    label: string;
    width: number;
    frozen?: boolean;
  }> = [];
  if (tableSettings.brand) {
    identityHeaders.push({ key: "brand", label: "Brand", width: 140, frozen: true });
  }
  if (tableSettings.category) {
    identityHeaders.push({ key: "category", label: "Category", width: 150, frozen: true });
  }
  if (tableSettings.model) {
    identityHeaders.push({ key: "model", label: "Model", width: 170, frozen: true });
  }
  if (tableSettings.barcode) {
    identityHeaders.push({ key: "barcode", label: "Barcode", width: 130 });
  }
  if (tableSettings.size) {
    identityHeaders.push({ key: "size", label: "Size", width: 90 });
  }

  const metricHeaders: Array<{ key: HistorySortKey; label: string; width: number }> = [];
  if (tableSettings.total) {
    metricHeaders.push({ key: "total", label: "Total", width: 90 });
  }
  if (showTransitColumns && tableSettings.toCustomer) {
    metricHeaders.push({ key: "toCustomer", label: "To Customer", width: 110 });
  }
  if (showTransitColumns && tableSettings.fromCustomer) {
    metricHeaders.push({ key: "fromCustomer", label: "From Customer", width: 120 });
  }

  const warehouseHeaders = pivotWarehouses.map((wh) => ({
    key: `wh:${wh}` as HistorySortKey,
    label: formatWarehouseName(wh),
    width: 100,
    warehouse: wh,
  }));

  const allHeaders = [...identityHeaders, ...metricHeaders, ...warehouseHeaders];

  function frozenLeft(index: number): number {
    let left = 0;
    for (let i = 0; i < index; i++) {
      const h = allHeaders[i];
      if ("frozen" in h && h.frozen) left += h.width;
    }
    return left;
  }

  function cellValue(row: HistoryPivotRow, key: HistorySortKey): string {
    if (key.startsWith("wh:")) {
      const wh = key.slice(3);
      return formatNumber(row.byWarehouse[wh] ?? 0);
    }
    switch (key) {
      case "brand":
        return row.brand || "—";
      case "category":
        return row.category || "—";
      case "model":
        return row.model || "—";
      case "barcode":
        return row.barcode || "—";
      case "size":
        return displaySizeLabel(row.size) || "—";
      case "total":
        return formatNumber(row.total);
      case "toCustomer":
        return formatNumber(row.toCustomer);
      case "fromCustomer":
        return formatNumber(row.fromCustomer);
      default:
        return "—";
    }
  }

  if (!accounts.length) {
    return (
      <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        No marketplace accounts available.
      </div>
    );
  }

  const showEmptyNoSnapshots = datesLoaded && !availableDates.length && !pending;
  const showGrid = Boolean(snapshotDate && availableDates.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3">
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
          Marketplace
          <select
            className="h-9 rounded-xl border border-border bg-background px-2 text-sm font-medium text-foreground"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setWarehouse("");
              setSearchInput("");
              setSnapshotDate("");
              setRows([]);
              setDatesLoaded(false);
              setSnapshotLoaded(false);
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
          Inventory date
          <select
            className="h-9 rounded-xl border border-border bg-background px-2 text-sm font-medium text-foreground"
            value={snapshotDate}
            onChange={(e) => {
              setSnapshotDate(e.target.value);
              setWarehouse("");
              setSearchInput("");
            }}
            disabled={!availableDates.length}
          >
            {!availableDates.length ? (
              <option value="">No inventory dates</option>
            ) : (
              availableDates.map((d, i) => (
                <option key={d} value={d}>
                  {formatInventoryDate(d, i === 0)}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
          Warehouse
          <WarehouseLocationSelect
            value={warehouse}
            onChange={setWarehouse}
            names={warehouseOptions}
            disabled={!rows.length && warehouseOptions.length === 0}
            className="min-w-[10rem]"
          />
        </label>

        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Search
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              className="h-9 w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
              placeholder="Search brand, category, model, barcode, size…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              disabled={!rows.length}
            />
          </span>
        </label>

        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-card-hover"
          onClick={() => {
            startTransition(() => {
              loadSnapshot().catch((e) =>
                setError(e instanceof Error ? e.message : String(e))
              );
            });
          }}
          disabled={!snapshotDate}
        >
          <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
          Refresh
        </button>

        <div ref={settingsRef} className="relative">
          <button
            type="button"
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-card-hover",
              settingsOpen && "border-primary/40 bg-primary/5"
            )}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <Settings2 className="h-4 w-4" />
            Table Settings
          </button>
          {settingsOpen ? (
            <div
              role="dialog"
              aria-label="Table settings"
              className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-border bg-card p-3 shadow-lg"
            >
              <p className="mb-2 text-xs font-semibold text-foreground">Visible columns</p>
              <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
                Hiding Size / Model / Category regroups rows by the lowest visible product level.
              </p>
              <ul className="space-y-1.5">
                {visibleSettingsLabels.map(({ key, label }) => (
                  <li key={key}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-border"
                        checked={tableSettings[key]}
                        onChange={(e) => setSetting(key, e.target.checked)}
                      />
                      {label}
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Warehouse columns stay visible for all grouping levels.
              </p>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-card-hover disabled:opacity-50"
          onClick={exportFilteredExcel}
          disabled={!filteredSorted.length}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Export Excel
        </button>

        <a
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-card-hover",
            !accountId && "pointer-events-none opacity-50"
          )}
          href={`/api/inventory/history/original?marketplaceAccountId=${encodeURIComponent(accountId)}${
            snapshotDate ? `&snapshotDate=${encodeURIComponent(snapshotDate)}` : ""
          }`}
        >
          <Download className="h-4 w-4" />
          Download Original CSV
        </a>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {showEmptyNoSnapshots ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            No historical inventory snapshots available.
          </p>
          <p>Run Historical Inventory Import to populate this page.</p>
        </div>
      ) : null}

      {showGrid ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Inventory</h2>
              <p className="text-xs text-muted-foreground">
                As of{" "}
                {formatInventoryDate(snapshotDate, availableDates[0] === snapshotDate)}
                {snapshotLoaded
                  ? ` · ${formatNumber(filteredSorted.length)} rows`
                  : pending
                    ? " · loading…"
                    : ""}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <button
                type="button"
                className="rounded-lg border border-border p-1 disabled:opacity-40"
                disabled={pageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>
                Page {pageSafe} / {totalPages}
              </span>
              <button
                type="button"
                className="rounded-lg border border-border p-1 disabled:opacity-40"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </span>
          </div>

          <div className="max-h-[calc(100vh-16rem)] overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  {allHeaders.map((col, index) => {
                    const frozen = "frozen" in col && Boolean(col.frozen);
                    const numeric =
                      col.key === "total" ||
                      col.key === "toCustomer" ||
                      col.key === "fromCustomer" ||
                      col.key.startsWith("wh:");
                    return (
                      <SortableTh
                        key={col.key}
                        label={col.label}
                        active={isActive(col.key)}
                        direction={directionFor(col.key)}
                        onClick={() => onSort(col.key)}
                        align={numeric ? "right" : "left"}
                        className={cn(
                          "whitespace-nowrap px-3 py-2 font-medium",
                          frozen && "sticky z-30 border-r border-border/60 bg-card"
                        )}
                        style={
                          frozen
                            ? {
                                left: frozenLeft(index),
                                minWidth: col.width,
                                maxWidth: col.width,
                              }
                            : { minWidth: col.width }
                        }
                      />
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, rowIndex) => {
                  const rowBg = rowIndex % 2 === 1 ? "bg-background/50" : "bg-card";
                  return (
                    <tr
                      key={row.key}
                      className={cn(
                        "border-b border-border/50 hover:bg-card-hover/60",
                        rowBg
                      )}
                    >
                      {allHeaders.map((col, index) => {
                        const frozen = "frozen" in col && Boolean(col.frozen);
                        const numeric =
                          col.key === "total" ||
                          col.key === "toCustomer" ||
                          col.key === "fromCustomer" ||
                          col.key.startsWith("wh:");
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              "whitespace-nowrap px-3 py-2.5",
                              numeric ? "text-right tabular-nums" : "text-left",
                              col.key === "model" && "font-medium",
                              col.key === "barcode" && "font-mono text-xs",
                              frozen &&
                                cn("sticky z-10 border-r border-border/60", rowBg)
                            )}
                            style={
                              frozen
                                ? {
                                    left: frozenLeft(index),
                                    minWidth: col.width,
                                    maxWidth: col.width,
                                  }
                                : undefined
                            }
                          >
                            {cellValue(row, col.key)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {snapshotLoaded && filteredSorted.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(1, allHeaders.length)}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      No stock rows for this filter
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
