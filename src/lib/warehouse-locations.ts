/**
 * Warehouse Location — shipping location as a first-class filter grain.
 *
 * Every shipping location (WB FBO warehouses and FBS seller locations) is a
 * Warehouse Location. Type (wb | fbs) is informational metadata only.
 * Business modules group and filter by location name — never by type.
 */

import { formatWarehouseName } from "@/lib/warehouse-name-aliases";

export type WarehouseLocationType = "wb" | "fbs";

export type WarehouseLocation = {
  /** Canonical DB / API warehouse name (aggregation key). */
  name: string;
  /** Localized label for selectors and tables. */
  displayName: string;
  /** Informational only — never used for business branching. */
  type: WarehouseLocationType;
  /** True when observed in live stock or recent orders/sales. */
  active: boolean;
};

/** Sources that contributed a location name (for diagnostics / active rules). */
export type WarehouseLocationSource = "stock" | "sales" | "orders" | "snapshot";

const FBS_NAME_RE =
  /^(fbs\b)|(\bfbs\b)|(склад\s*продавца)|(seller\s*warehouse)|\bmp\b/i;

/**
 * Classify location type from the warehouse name string.
 * Metadata only — must not drive filters, KPIs, or accounting.
 */
export function classifyWarehouseLocationType(
  name: string | null | undefined
): WarehouseLocationType {
  const key = (name ?? "").trim();
  if (!key) return "wb";
  return FBS_NAME_RE.test(key) ? "fbs" : "wb";
}

export function buildWarehouseLocation(
  name: string,
  options: { active?: boolean } = {}
): WarehouseLocation {
  const trimmed = name.trim();
  return {
    name: trimmed,
    displayName: formatWarehouseName(trimmed),
    type: classifyWarehouseLocationType(trimmed),
    active: options.active !== false,
  };
}

/**
 * Merge raw location names into a sorted Warehouse Location catalog.
 * Dedupes by exact trimmed name (same key as warehouse sales grouping).
 */
export function buildWarehouseLocations(
  entries: Iterable<{
    name: string | null | undefined;
    active?: boolean;
  }>
): WarehouseLocation[] {
  const byName = new Map<string, { active: boolean }>();

  for (const entry of entries) {
    if (entry.name == null) continue;
    const name = entry.name.trim();
    if (!name) continue;
    const prev = byName.get(name);
    const active = entry.active !== false;
    if (!prev) {
      byName.set(name, { active });
    } else {
      byName.set(name, { active: prev.active || active });
    }
  }

  return [...byName.entries()]
    .map(([name, meta]) => buildWarehouseLocation(name, { active: meta.active }))
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" })
    );
}

/** Location names only — drop-in for existing string[] warehouse selectors. */
export function warehouseLocationNames(
  locations: readonly WarehouseLocation[],
  options: { activeOnly?: boolean } = {}
): string[] {
  return locations
    .filter((loc) => (options.activeOnly ? loc.active : true))
    .map((loc) => loc.name);
}

/**
 * Union snapshot/stock names with the account catalog so FBS locations discovered
 * from orders/sales appear alongside WB warehouses in the same selector.
 */
export function mergeWarehouseNameLists(
  ...lists: Array<Iterable<string | null | undefined>>
): string[] {
  const set = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      if (raw == null) continue;
      const name = raw.trim();
      if (name) set.add(name);
    }
  }
  return [...set].sort((a, b) =>
    formatWarehouseName(a).localeCompare(formatWarehouseName(b), "en", {
      sensitivity: "base",
    })
  );
}
