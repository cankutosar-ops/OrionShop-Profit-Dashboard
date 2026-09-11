"use client";

import { formatWarehouseName } from "@/lib/warehouse-name-aliases";
import type { WarehouseLocation } from "@/lib/warehouse-locations";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (warehouseName: string) => void;
  /** Prefer full Warehouse Location objects; falls back to name strings. */
  locations?: readonly WarehouseLocation[];
  names?: readonly string[];
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Empty option label — default "All warehouses". */
  allLabel?: string;
};

/**
 * Shared warehouse selector — filters by Warehouse Location name only.
 * Does not expose fulfillment-type filters (WB vs FBS).
 */
export function WarehouseLocationSelect({
  value,
  onChange,
  locations,
  names,
  disabled,
  className,
  id,
  allLabel = "All warehouses",
}: Props) {
  const options: Array<{ name: string; label: string }> =
    locations && locations.length > 0
      ? locations.map((loc) => ({ name: loc.name, label: loc.displayName }))
      : (names ?? []).map((name) => ({
          name,
          label: formatWarehouseName(name),
        }));

  return (
    <select
      id={id}
      className={cn(
        "h-9 rounded-xl border border-border bg-background px-2 text-sm font-medium text-foreground",
        className
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Warehouse location"
    >
      <option value="">{allLabel}</option>
      {options.map((opt) => (
        <option key={opt.name} value={opt.name}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
