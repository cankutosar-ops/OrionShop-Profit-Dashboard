/**
 * Warehouse Location catalog — unions shipping location names from stock,
 * sales, and orders. Does not redesign HDW sync / checkpoints / sessions.
 */

import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import {
  buildWarehouseLocations,
  warehouseLocationNames,
  type WarehouseLocation,
} from "@/lib/warehouse-locations";

const PAGE_SIZE = 1000;

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createServerClient());
}

/**
 * Collect distinct non-null warehouse names from one account-scoped table.
 */
async function collectDistinctWarehouseColumn(
  client: SupabaseClient,
  table: "wb_stock" | "wb_sales" | "wb_orders",
  marketplaceAccountId: string
): Promise<string[]> {
  const names = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await client
      .from(table)
      .select("warehouse")
      .eq("marketplace_account_id", marketplaceAccountId)
      .not("warehouse", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      // Soft-fail missing column / empty schema — catalog still builds from other sources.
      if (/does not exist|schema cache|Could not find/i.test(error.message)) {
        return [...names];
      }
      throw new Error(`Failed to list warehouses from ${table}: ${error.message}`);
    }

    const page = data ?? [];
    for (const row of page) {
      const wh = (row as { warehouse?: string | null }).warehouse;
      if (wh != null && String(wh).trim()) names.add(String(wh).trim());
    }

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset > 200_000) break;
  }

  return [...names];
}

/**
 * Account-level Warehouse Location catalog (WB + FBS as peers).
 * Type is metadata only; callers filter/group by `name`.
 */
export async function listWarehouseLocations(
  marketplaceAccountId: string,
  options: {
    activeOnly?: boolean;
    client?: SupabaseClient;
  } = {}
): Promise<WarehouseLocation[]> {
  const client = await getClient(options.client);
  const [stock, sales, orders] = await Promise.all([
    collectDistinctWarehouseColumn(client, "wb_stock", marketplaceAccountId),
    collectDistinctWarehouseColumn(client, "wb_sales", marketplaceAccountId),
    collectDistinctWarehouseColumn(client, "wb_orders", marketplaceAccountId),
  ]);

  const stockSet = new Set(stock);
  const entries: Array<{ name: string; active: boolean }> = [];

  for (const name of stock) {
    entries.push({ name, active: true });
  }
  for (const name of sales) {
    // Sales/orders locations (incl. FBS) are active shipping locations.
    entries.push({ name, active: true });
  }
  for (const name of orders) {
    entries.push({ name, active: true });
  }

  // stockSet reserved for future inactive/seed rules.
  void stockSet;

  const locations = buildWarehouseLocations(entries);
  if (options.activeOnly) {
    return locations.filter((loc) => loc.active);
  }
  return locations;
}

/** String names for drop-in replacement of legacy warehouse string[] selectors. */
export async function listWarehouseLocationNames(
  marketplaceAccountId: string,
  options: {
    activeOnly?: boolean;
    client?: SupabaseClient;
  } = {}
): Promise<string[]> {
  const locations = await listWarehouseLocations(marketplaceAccountId, options);
  return warehouseLocationNames(locations, { activeOnly: options.activeOnly });
}
