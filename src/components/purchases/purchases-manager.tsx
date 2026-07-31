"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Package,
  Search,
  ShoppingBag,
  Wallet,
  CalendarClock,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { useProductContextQueryString } from "@/hooks/use-product-context-query";
import { formatKpiCount, formatKpiCurrency } from "@/lib/kpi-format";
import { PRODUCT_INTEL_NAV_PARAMS } from "@/lib/product-intelligence-nav";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import type { PurchaseCurrency, PurchaseListItem } from "@/types/database";
import { PURCHASE_CURRENCIES } from "@/types/database";
import { buildPurchaseLedgerSummary } from "@/lib/purchase-ledger-summary";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";

type PurchasesManagerProps = {
  purchases: PurchaseListItem[];
  productCount: number;
  /** Company / system base currency — exchange rate hidden when purchase currency matches. */
  baseCurrency: string;
};

type ImportHeaderState = {
  purchase_date: string;
  supplier: string;
  invoice_number: string;
  currency: PurchaseCurrency;
  exchange_rate: string;
  notes: string;
};

type ImportSuccessState = {
  purchaseId: string;
  productsUpdated: number;
  newProducts: number;
  errors: number;
};

function defaultHeader(baseCurrency: string): ImportHeaderState {
  const currency = (PURCHASE_CURRENCIES.includes(baseCurrency as PurchaseCurrency)
    ? baseCurrency
    : "TRY") as PurchaseCurrency;
  return {
    purchase_date: new Date().toISOString().split("T")[0],
    supplier: "",
    invoice_number: "",
    currency,
    exchange_rate: "",
    notes: "",
  };
}

function showExchangeRate(currency: string, baseCurrency: string): boolean {
  return currency.toUpperCase() !== baseCurrency.toUpperCase();
}

type PurchaseSortKey =
  | "purchaseDate"
  | "supplier"
  | "invoice"
  | "products"
  | "totalCost"
  | "currency"
  | "created";

const PURCHASE_DEFAULT_SORT = {
  key: "purchaseDate" as const,
  direction: "desc" as const,
};

function purchaseSortValue(row: PurchaseListItem, key: PurchaseSortKey): SortValue {
  switch (key) {
    case "purchaseDate":
      return row.purchase_date;
    case "supplier":
      return row.supplier;
    case "invoice":
      return row.invoice_number;
    case "products":
      return row.line_count;
    case "totalCost":
      return row.total_cost;
    case "currency":
      return row.currency;
    case "created":
      return row.created_at;
  }
}

export function PurchasesManager({
  purchases,
  productCount,
  baseCurrency,
}: PurchasesManagerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState(
    () => searchParams.get(PRODUCT_INTEL_NAV_PARAMS.sku) ?? ""
  );
  const skuParam = searchParams.get(PRODUCT_INTEL_NAV_PARAMS.sku)?.trim() ?? "";
  const [header, setHeader] = useState<ImportHeaderState>(() =>
    defaultHeader(baseCurrency)
  );
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<ImportSuccessState | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const scopeQuery = useProductContextQueryString();
  const summary = useMemo(() => buildPurchaseLedgerSummary(purchases), [purchases]);

  useEffect(() => {
    setSearch(skuParam);
  }, [skuParam]);

  const filteredPurchases = useMemo(() => {
    if (skuParam) {
      const skuLower = skuParam.toLowerCase();
      const exact = purchases.filter((purchase) =>
        purchase.supplierArticles.some((article) => article.toLowerCase() === skuLower)
      );
      if (exact.length > 0) return exact;
    }

    const query = search.trim().toLowerCase();
    if (!query) return purchases;
    return purchases.filter(
      (purchase) =>
        purchase.supplier.toLowerCase().includes(query) ||
        purchase.notes?.toLowerCase().includes(query) ||
        purchase.currency.toLowerCase().includes(query) ||
        purchase.invoice_number?.toLowerCase().includes(query) ||
        purchase.supplierArticles.some((article) => article.toLowerCase().includes(query))
    );
  }, [purchases, search, skuParam]);

  const { sort, onSort, directionFor, isActive } =
    useCycleSort<PurchaseSortKey>(PURCHASE_DEFAULT_SORT);
  const getPurchaseValue = useCallback(
    (row: PurchaseListItem, key: PurchaseSortKey) => purchaseSortValue(row, key),
    []
  );
  const sortedPurchases = useMemo(
    () => sortRowsBySpec(filteredPurchases, sort, getPurchaseValue),
    [filteredPurchases, sort, getPurchaseValue]
  );

  function purchaseHref(purchaseId: string) {
    const base = `/purchases/${purchaseId}`;
    return scopeQuery ? `${base}?${scopeQuery}` : base;
  }

  function resetFeedback() {
    setMessage(null);
    setError(null);
    setImportSuccess(null);
  }

  function toggleExpanded(purchaseId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(purchaseId)) next.delete(purchaseId);
      else next.add(purchaseId);
      return next;
    });
  }

  async function handleExportTemplate() {
    resetFeedback();
    setExporting(true);

    try {
      const url = scopeQuery
        ? `/api/purchases/template?${scopeQuery}`
        : "/api/purchases/template";
      const response = await fetch(url);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ?? `Purchases_Template_${new Date().toISOString().split("T")[0]}.xlsx`;

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);

      setMessage(`Exported template for ${productCount} products`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    resetFeedback();
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("purchase_date", header.purchase_date);
      formData.append("supplier", header.supplier);
      formData.append("currency", header.currency);
      if (header.invoice_number.trim()) {
        formData.append("invoice_number", header.invoice_number.trim());
      }
      if (showExchangeRate(header.currency, baseCurrency) && header.exchange_rate.trim()) {
        formData.append("exchange_rate", header.exchange_rate.trim());
      }
      if (header.notes.trim()) {
        formData.append("notes", header.notes.trim());
      }

      const uploadUrl = scopeQuery
        ? `/api/purchases/upload?${scopeQuery}`
        : "/api/purchases/upload";
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Upload failed");
      }

      const errorCount = (data.errors ?? []).length;
      if (data.purchaseId) {
        setImportSuccess({
          purchaseId: String(data.purchaseId),
          productsUpdated: Number(data.productsImported ?? 0),
          newProducts: Number(data.newProducts ?? 0),
          errors: errorCount,
        });
      }

      if (errorCount > 0) {
        const fullLog = (data.errors as { row: number; message: string }[])
          .map((item) => `Row ${item.row}: ${item.message}`)
          .join("\n");
        console.error("[purchase-import] row errors:\n" + fullLog);
        setError(fullLog);
      }

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      console.error("[purchase-import] upload failed", { error: message });
      setError(message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  const exchangeVisible = showExchangeRate(header.currency, baseCurrency);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Import Purchase</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Import updates Product Cost History. This is a purchase ledger — not inventory or
              stock movement.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              type="button"
              onClick={handleExportTemplate}
              disabled={exporting || uploading}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-card-hover disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export Template"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {uploading ? "Importing…" : "Import Excel"}
            </button>
          </div>
        </div>

        <div
          className={cn(
            "grid gap-4 sm:grid-cols-2",
            exchangeVisible ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-3 xl:grid-cols-5"
          )}
        >
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Purchase Date</span>
            <input
              required
              type="date"
              value={header.purchase_date}
              onChange={(event) =>
                setHeader((current) => ({ ...current, purchase_date: event.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Supplier</span>
            <input
              type="text"
              value={header.supplier}
              onChange={(event) =>
                setHeader((current) => ({ ...current, supplier: event.target.value }))
              }
              placeholder="Supplier name"
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">
              Invoice Number <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              type="text"
              value={header.invoice_number}
              onChange={(event) =>
                setHeader((current) => ({ ...current, invoice_number: event.target.value }))
              }
              placeholder="Invoice / document no."
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Currency</span>
            <select
              value={header.currency}
              onChange={(event) => {
                const currency = event.target.value as PurchaseCurrency;
                setHeader((current) => ({
                  ...current,
                  currency,
                  exchange_rate: showExchangeRate(currency, baseCurrency)
                    ? current.exchange_rate
                    : "",
                }));
              }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            >
              {PURCHASE_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>

          {exchangeVisible && (
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Exchange Rate</span>
              <input
                type="number"
                min="0.000001"
                step="0.000001"
                value={header.exchange_rate}
                onChange={(event) =>
                  setHeader((current) => ({ ...current, exchange_rate: event.target.value }))
                }
                placeholder={`To ${baseCurrency}`}
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
          )}

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              type="text"
              value={header.notes}
              onChange={(event) =>
                setHeader((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Optional"
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            />
          </label>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Template columns: Supplier Article · Quantity · Unit Cost. Currency and invoice number are
          set on the purchase header only. Base currency: {baseCurrency}.
        </p>
      </div>

      {importSuccess && (
        <div className="rounded-2xl border border-success/30 bg-success/5 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-success">Import Completed</p>
              <ul className="mt-2 space-y-0.5 text-sm text-foreground">
                <li>{formatNumber(importSuccess.productsUpdated)} Products Updated</li>
                <li>{formatNumber(importSuccess.newProducts)} New Products</li>
                <li>{formatNumber(importSuccess.errors)} Errors</li>
              </ul>
            </div>
            <Link
              href={purchaseHref(importSuccess.purchaseId)}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              View Purchase
            </Link>
          </div>
        </div>
      )}

      {(message || error) && (
        <div className="space-y-1">
          {message && <p className="text-sm text-success">{message}</p>}
          {error && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
              {error}
            </pre>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Purchases"
          icon={ShoppingBag}
          value={formatKpiCount(summary.totalPurchases)}
          size="compact"
        />
        <MetricCard
          title="Total Purchase Value"
          icon={Wallet}
          value={formatKpiCurrency(summary.totalPurchaseValue, baseCurrency)}
          size="compact"
          subtitle="Sum of imported line totals"
        />
        <MetricCard
          title="Products Updated"
          icon={Package}
          value={formatKpiCount(summary.productsUpdated)}
          size="compact"
        />
        <MetricCard
          title="Last Import Date"
          icon={CalendarClock}
          value={summary.lastImportAt ? formatDate(summary.lastImportAt) : "—"}
          size="compact"
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by supplier, invoice, notes, or SKU…"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {sortedPurchases.length} of {purchases.length} purchases
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="w-10 px-3 py-3" aria-label="Expand" />
                <SortableTh
                  label="Purchase Date"
                  active={isActive("purchaseDate")}
                  direction={directionFor("purchaseDate")}
                  onClick={() => onSort("purchaseDate")}
                  className="px-4 py-3"
                />
                <SortableTh
                  label="Supplier"
                  active={isActive("supplier")}
                  direction={directionFor("supplier")}
                  onClick={() => onSort("supplier")}
                  className="px-4 py-3"
                />
                <SortableTh
                  label="Invoice No"
                  active={isActive("invoice")}
                  direction={directionFor("invoice")}
                  onClick={() => onSort("invoice")}
                  className="px-4 py-3"
                />
                <SortableTh
                  label="Products"
                  active={isActive("products")}
                  direction={directionFor("products")}
                  onClick={() => onSort("products")}
                  className="px-4 py-3"
                />
                <SortableTh
                  label="Total Cost"
                  active={isActive("totalCost")}
                  direction={directionFor("totalCost")}
                  onClick={() => onSort("totalCost")}
                  className="px-4 py-3"
                />
                <SortableTh
                  label="Currency"
                  active={isActive("currency")}
                  direction={directionFor("currency")}
                  onClick={() => onSort("currency")}
                  className="px-4 py-3"
                />
                <SortableTh
                  label="Created"
                  active={isActive("created")}
                  direction={directionFor("created")}
                  onClick={() => onSort("created")}
                  className="px-4 py-3"
                />
              </tr>
            </thead>
            <tbody>
              {sortedPurchases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12">
                    {purchases.length === 0 ? (
                      <div className="mx-auto max-w-lg text-left">
                        <p className="text-center text-base font-medium text-foreground">
                          No purchases yet
                        </p>
                        <p className="mt-2 text-center text-sm text-muted-foreground">
                          Purchases maintain Product Cost History. Get started:
                        </p>
                        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                          <li>Download the template.</li>
                          <li>Fill Supplier Article, Quantity and Unit Cost.</li>
                          <li>Import the completed file.</li>
                          <li>Product Cost History will be updated automatically.</li>
                        </ol>
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground">
                        No purchases match your search.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                sortedPurchases.map((purchase) => {
                  const expanded = expandedIds.has(purchase.id);
                  return (
                    <Fragment key={purchase.id}>
                      <tr
                        className={cn(
                          "border-b border-border/50 transition-colors hover:bg-card-hover"
                        )}
                      >
                        <td className="px-3 py-3.5">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(purchase.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
                            aria-expanded={expanded}
                            aria-label={expanded ? "Collapse products" : "Expand products"}
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3.5 font-medium">
                          {formatDate(purchase.purchase_date)}
                        </td>
                        <td className="px-4 py-3.5">{purchase.supplier || "—"}</td>
                        <td className="px-4 py-3.5">{purchase.invoice_number || "—"}</td>
                        <td className="px-4 py-3.5">{formatNumber(purchase.line_count)}</td>
                        <td className="px-4 py-3.5 tabular-nums">
                          {formatCurrency(purchase.total_cost, purchase.currency)}
                        </td>
                        <td className="px-4 py-3.5">{purchase.currency}</td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {formatDate(purchase.created_at)}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-border/50 bg-muted/20">
                          <td colSpan={8} className="px-4 py-3">
                            {purchase.lines.length === 0 ? (
                              <p className="px-2 py-2 text-sm text-muted-foreground">
                                No product lines on this purchase.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                                <table className="w-full text-xs sm:text-sm">
                                  <thead>
                                    <tr className="border-b border-border text-left text-muted-foreground">
                                      <th className="px-4 py-2 font-medium">SKU</th>
                                      <th className="px-4 py-2 font-medium">Product Name</th>
                                      <th className="px-4 py-2 font-medium">Quantity</th>
                                      <th className="px-4 py-2 font-medium">Unit Cost</th>
                                      <th className="px-4 py-2 font-medium">Total Cost</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {purchase.lines.map((line) => (
                                      <tr
                                        key={line.id}
                                        className="border-b border-border/40 last:border-0"
                                      >
                                        <td className="px-4 py-2 font-mono text-xs text-primary">
                                          {line.supplier_article}
                                        </td>
                                        <td className="px-4 py-2">
                                          {line.product_name ?? "—"}
                                        </td>
                                        <td className="px-4 py-2 tabular-nums">
                                          {formatNumber(line.quantity)}
                                        </td>
                                        <td className="px-4 py-2 tabular-nums">
                                          {formatCurrency(line.unit_cost, purchase.currency)}
                                        </td>
                                        <td className="px-4 py-2 tabular-nums font-medium">
                                          {formatCurrency(
                                            line.quantity * line.unit_cost,
                                            purchase.currency
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <div className="mt-2 px-1">
                              <Link
                                href={purchaseHref(purchase.id)}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Open purchase detail
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
