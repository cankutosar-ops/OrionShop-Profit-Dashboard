"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";
import {
  formatDaysLeft,
  InventoryStatusBadge,
} from "@/components/inventory/inventory-status-badge";
import type {
  InventoryModelRow,
  InventoryModelSort,
  InventoryStatusFilter,
} from "@/lib/inventory-types";
import { cn, formatNumber } from "@/lib/utils";

type InventoryModelListProps = {
  models: InventoryModelRow[];
  selectedProductId: string | null;
  onSelect: (productId: string) => void;
};

const statusFilters: { id: InventoryStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "low", label: "Low Stock" },
  { id: "out", label: "Out of Stock" },
  { id: "healthy", label: "Healthy" },
];

const sortOptions: { id: InventoryModelSort; label: string }[] = [
  { id: "stock_desc", label: "Current Stock (High → Low)" },
  { id: "stock_asc", label: "Current Stock (Low → High)" },
  { id: "name_asc", label: "Model Name (A → Z)" },
  { id: "name_desc", label: "Model Name (Z → A)" },
];

function matchesFilter(model: InventoryModelRow, filter: InventoryStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "low") return model.status === "Low Stock";
  if (filter === "out") return model.status === "Out of Stock";
  return model.status === "Healthy";
}

function modelNameKey(model: InventoryModelRow): string {
  return `${model.supplierArticle} ${model.productName}`.trim().toLowerCase();
}

function sortModels(models: InventoryModelRow[], sort: InventoryModelSort): InventoryModelRow[] {
  const sorted = [...models];
  sorted.sort((a, b) => {
    if (sort === "stock_desc") return b.currentStock - a.currentStock;
    if (sort === "stock_asc") return a.currentStock - b.currentStock;
    if (sort === "name_asc") return modelNameKey(a).localeCompare(modelNameKey(b));
    return modelNameKey(b).localeCompare(modelNameKey(a));
  });
  return sorted;
}

export function InventoryModelList({
  models,
  selectedProductId,
  onSelect,
}: InventoryModelListProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>("all");
  const [sort, setSort] = useState<InventoryModelSort>("stock_desc");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matched = models.filter((model) => {
      if (!matchesFilter(model, statusFilter)) return false;
      if (!normalized) return true;
      return (
        model.supplierArticle.toLowerCase().includes(normalized) ||
        model.productName.toLowerCase().includes(normalized)
      );
    });
    return sortModels(matched, sort);
  }, [models, query, statusFilter, sort]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card">
      <div className="shrink-0 space-y-3 border-b border-border p-4">
        <div>
          <h2 className="text-sm font-semibold">Models</h2>
          <p className="text-xs text-muted-foreground">{filtered.length} in list</p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search model or product…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5" />
            Sort
          </span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as InventoryModelSort)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
            aria-label="Sort models"
          >
            {sortOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatusFilter(filter.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                statusFilter === filter.id
                  ? "bg-primary/10 text-primary"
                  : "bg-card-hover text-muted-foreground hover:text-foreground"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-3 py-2 text-right font-medium">Current Stock</th>
              <th className="px-3 py-2 text-right font-medium">Days Left</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No models match your filters
                </td>
              </tr>
            ) : (
              filtered.map((model) => {
                const isSelected = selectedProductId === model.productId;
                return (
                  <tr
                    key={model.productId}
                    onClick={() => onSelect(model.productId)}
                    className={cn(
                      "cursor-pointer border-b border-border/50 transition-colors hover:bg-card-hover",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-medium text-primary">
                        {model.supplierArticle}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {model.productName}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatNumber(model.currentStock)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                      {formatDaysLeft(model.daysLeft)}
                    </td>
                    <td className="px-4 py-3">
                      <InventoryStatusBadge status={model.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
