"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { CostManagementRow } from "@/types/database";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

type CostManagementTableProps = {
  rows: CostManagementRow[];
  scopeQuery: string;
  onRowUpdated: (rows: CostManagementRow[]) => void;
};

function formatPurchasePrice(value: number | null): string {
  if (value === null) return "—";
  return formatCurrency(value);
}

function parsePurchasePriceInput(raw: string): number {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) {
    throw new Error("Enter a purchase price");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Enter a non-negative number");
  }
  return value;
}

function sortCostManagementRows(rows: CostManagementRow[]): CostManagementRow[] {
  return [...rows].sort((a, b) => {
    const aMissing = a.currentPurchasePrice === null ? 0 : 1;
    const bMissing = b.currentPurchasePrice === null ? 0 : 1;
    if (aMissing !== bMissing) return aMissing - bMissing;
    return a.supplierArticle.localeCompare(b.supplierArticle, undefined, { sensitivity: "base" });
  });
}

function filterCostManagementRows(rows: CostManagementRow[], query: string): CostManagementRow[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;

  return rows.filter(
    (row) =>
      row.supplierArticle.toLowerCase().includes(normalized) ||
      row.productName.toLowerCase().includes(normalized)
  );
}

function PurchasePriceCell({
  row,
  scopeQuery,
  onRowUpdated,
  onError,
}: {
  row: CostManagementRow;
  scopeQuery: string;
  onRowUpdated: (row: CostManagementRow) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);

  function startEditing() {
    if (saving) return;
    setDraft(row.currentPurchasePrice !== null ? String(row.currentPurchasePrice) : "");
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function cancelEditing() {
    setEditing(false);
    setDraft("");
  }

  async function saveValue(nextCost: number) {
    if (committingRef.current) return;
    committingRef.current = true;

    if (row.currentPurchasePrice === nextCost) {
      cancelEditing();
      committingRef.current = false;
      return;
    }

    const previousValue = row.currentPurchasePrice;
    onRowUpdated({ ...row, currentPurchasePrice: nextCost });
    setSaving(true);

    try {
      const url = scopeQuery
        ? `/api/costs/rows/${row.productId}?${scopeQuery}`
        : `/api/costs/rows/${row.productId}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost: nextCost }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save cost");
      }

      onRowUpdated(data as CostManagementRow);
      cancelEditing();
    } catch (err) {
      onRowUpdated({ ...row, currentPurchasePrice: previousValue });
      onError(err instanceof Error ? err.message : "Failed to save cost");
      cancelEditing();
    } finally {
      setSaving(false);
      committingRef.current = false;
    }
  }

  async function commitEditing() {
    try {
      const nextCost = parsePurchasePriceInput(draft);
      await saveValue(nextCost);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Invalid purchase price");
      cancelEditing();
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commitEditing();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelEditing();
          }
        }}
        onBlur={() => {
          void commitEditing();
        }}
        className="w-full min-w-[7rem] rounded-lg border border-primary bg-background px-2 py-1 text-right text-sm tabular-nums outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={saving}
      className={cn(
        "w-full rounded-lg px-2 py-1 text-right text-sm tabular-nums transition-colors",
        "hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        saving && "opacity-60",
        row.currentPurchasePrice === null && "text-muted-foreground"
      )}
      title="Click to edit purchase price"
    >
      {formatPurchasePrice(row.currentPurchasePrice)}
    </button>
  );
}

export function CostManagementTable({ rows, scopeQuery, onRowUpdated }: CostManagementTableProps) {
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const displayRows = useMemo(() => {
    const sorted = sortCostManagementRows(rows);
    return filterCostManagementRows(sorted, search);
  }, [rows, search]);

  function updateSingleRow(updated: CostManagementRow) {
    onRowUpdated(rows.map((row) => (row.productId === updated.productId ? updated : row)));
  }

  const productCountLabel =
    search.trim() && displayRows.length !== rows.length
      ? `${displayRows.length} of ${rows.length} products`
      : `${rows.length} products`;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card">
        <div className="space-y-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold">Product Costs</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {productCountLabel} · click purchase price to edit
            </p>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by Model Code or Product Name..."
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
            />
          </div>
        </div>

        <div className="max-h-[min(70vh,960px)] overflow-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left font-medium">Model Code</th>
                <th className="px-3 py-2.5 text-left font-medium">Product Name</th>
                <th className="px-3 py-2.5 text-right font-medium">Current Stock</th>
                <th className="px-3 py-2.5 text-right font-medium">Current Sale Price</th>
                <th className="px-4 py-2.5 text-right font-medium">Current Purchase Price</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No products match your search.
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => (
                  <tr
                    key={row.productId}
                    className="border-b border-border/60 hover:bg-card-hover/40"
                  >
                    <td className="px-4 py-2 font-medium">{row.supplierArticle}</td>
                    <td className="max-w-[16rem] px-3 py-2">
                      <span className="block truncate" title={row.productName}>
                        {row.productName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.currentStock)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.currentSalePrice !== null ? formatCurrency(row.currentSalePrice) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <PurchasePriceCell
                        row={row}
                        scopeQuery={scopeQuery}
                        onRowUpdated={updateSingleRow}
                        onError={setError}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <p className="whitespace-pre-wrap text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
