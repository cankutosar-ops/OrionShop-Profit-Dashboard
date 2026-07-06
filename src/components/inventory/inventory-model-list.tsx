"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  formatDaysLeft,
  InventoryStatusBadge,
} from "@/components/inventory/inventory-status-badge";
import type { InventoryModelRow, InventoryStatusFilter } from "@/lib/inventory-types";
import { cn, formatNumber } from "@/lib/utils";

type InventoryModelListProps = {
  models: InventoryModelRow[];
  selectedProductId: string | null;
  onSelect: (productId: string) => void;
};

const filters: { id: InventoryStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "low", label: "Low Stock" },
  { id: "out", label: "Out of Stock" },
  { id: "healthy", label: "Healthy" },
];

function matchesFilter(model: InventoryModelRow, filter: InventoryStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "low") return model.status === "Low Stock";
  if (filter === "out") return model.status === "Out of Stock";
  return model.status === "Healthy";
}

export function InventoryModelList({
  models,
  selectedProductId,
  onSelect,
}: InventoryModelListProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>("all");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return models.filter((model) => {
      if (!matchesFilter(model, statusFilter)) return false;
      if (!normalized) return true;
      return (
        model.supplierArticle.toLowerCase().includes(normalized) ||
        model.productName.toLowerCase().includes(normalized)
      );
    });
  }, [models, query, statusFilter]);

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

        <div className="flex flex-wrap gap-1.5">
          {filters.map((filter) => (
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
