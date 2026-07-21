"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useProductContextQueryString } from "@/hooks/use-product-context-query";
import { PRODUCT_INTEL_NAV_PARAMS } from "@/lib/product-intelligence-nav";
import type { PurchaseCurrency, PurchaseListItem } from "@/types/database";
import { PURCHASE_CURRENCIES } from "@/types/database";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type PurchasesManagerProps = {
  purchases: PurchaseListItem[];
  productCount: number;
};

type ImportHeaderState = {
  purchase_date: string;
  supplier: string;
  currency: PurchaseCurrency;
  exchange_rate: string;
  notes: string;
};

const defaultHeader = (): ImportHeaderState => ({
  purchase_date: new Date().toISOString().split("T")[0],
  supplier: "",
  currency: "USD",
  exchange_rate: "",
  notes: "",
});

export function PurchasesManager({ purchases, productCount }: PurchasesManagerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState(
    () => searchParams.get(PRODUCT_INTEL_NAV_PARAMS.sku) ?? ""
  );
  const skuParam = searchParams.get(PRODUCT_INTEL_NAV_PARAMS.sku)?.trim() ?? "";
  const [header, setHeader] = useState<ImportHeaderState>(defaultHeader);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scopeQuery = useProductContextQueryString();

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
        purchase.supplierArticles.some((article) => article.toLowerCase().includes(query))
    );
  }, [purchases, search, skuParam]);

  function purchaseHref(purchaseId: string) {
    const base = `/purchases/${purchaseId}`;
    return scopeQuery ? `${base}?${scopeQuery}` : base;
  }

  function resetFeedback() {
    setMessage(null);
    setError(null);
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
      if (header.currency !== "RUB" && header.exchange_rate.trim()) {
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
      setMessage(
        [
          "Purchase Created",
          `Products Imported: ${data.productsImported ?? 0}`,
          `Skipped: ${data.skipped ?? 0}`,
          `Errors: ${errorCount}`,
        ].join(" · ")
      );

      if (errorCount > 0) {
        const fullLog = (data.errors as { row: number; message: string }[])
          .map((item) => `Row ${item.row}: ${item.message}`)
          .join("\n");
        console.error("[purchase-import] row errors:\n" + fullLog);
        setError(fullLog);
      }

      if (data.purchaseId) {
        router.push(purchaseHref(String(data.purchaseId)));
      } else {
        router.refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      console.error("[purchase-import] upload failed", { error: message });
      setError(message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Import Purchase</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              One Excel file creates one purchase record with all product lines.
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            <span className="font-medium">Currency</span>
            <select
              value={header.currency}
              onChange={(event) => {
                const currency = event.target.value as PurchaseCurrency;
                setHeader((current) => ({
                  ...current,
                  currency,
                  exchange_rate: currency === "RUB" ? "" : current.exchange_rate,
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

          {header.currency !== "RUB" && (
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
                placeholder="Optional"
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
          )}

          <label className="space-y-1.5 text-sm sm:col-span-2 lg:col-span-1">
            <span className="font-medium">Notes</span>
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
          Template columns: Supplier Article · Quantity · Unit Cost. Currency is set on the purchase
          header only.
        </p>
      </div>

      {(message || error) && (
        <div className="space-y-1">
          {message && <p className="text-sm text-success">{message}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by supplier, notes, or SKU/article…"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filteredPurchases.length} of {purchases.length} purchases
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">Purchase Date</th>
                <th className="px-6 py-3 font-medium">Supplier</th>
                <th className="px-6 py-3 font-medium">Currency</th>
                <th className="px-6 py-3 font-medium">Exchange Rate</th>
                <th className="px-6 py-3 font-medium">Lines</th>
                <th className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    {purchases.length === 0
                      ? "No purchases yet. Export the template, fill in quantities and costs, then import."
                      : "No purchases match your search."}
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((purchase) => (
                  <tr
                    key={purchase.id}
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-card-hover"
                    )}
                  >
                    <td className="px-6 py-3.5">
                      <Link
                        href={purchaseHref(purchase.id)}
                        className="font-medium text-primary hover:underline"
                      >
                        {formatDate(purchase.purchase_date)}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5">{purchase.supplier || "—"}</td>
                    <td className="px-6 py-3.5">{purchase.currency}</td>
                    <td className="px-6 py-3.5">
                      {purchase.exchange_rate ?? "—"}
                    </td>
                    <td className="px-6 py-3.5">{formatNumber(purchase.line_count)}</td>
                    <td className="px-6 py-3.5 text-muted-foreground">
                      {formatDate(purchase.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
