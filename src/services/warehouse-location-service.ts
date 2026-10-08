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
import { readCurrentStockWarehouseNames } from "@/services/current-stock-repository";
import { readSellerWarehouses } from "@/services/wb-seller-warehouse-service";
import { fbsWarehouseLabel } from "@/lib/fbs-warehouse-attribution";

const PAGE_SIZE = 1000;

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createServerClient());
}

/**
 * Collect distinct non-null warehouse names from one account-scoped table.
 */
async function collectDistinctWarehouseColumn(
  client: SupabaseClient,
  table: "wb_sales" | "wb_orders",
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
  const [stock, sales, orders, sellerWarehouses] = await Promise.all([
    readCurrentStockWarehouseNames(marketplaceAccountId, client),
    collectDistinctWarehouseColumn(client, "wb_sales", marketplaceAccountId),
    collectDistinctWarehouseColumn(client, "wb_orders", marketplaceAccountId),
    readSellerWarehouses(marketplaceAccountId, client),
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

  const fbs = sellerWarehouses.filter(row => row.delivery_type === 1 && row.is_deleting !== true);
  const locations = buildWarehouseLocations([
    ...entries, ...fbs.map(row => ({ name: fbsWarehouseLabel(row.name, row.seller_warehouse_id), active: true })),
  ]).map(location => {
    const matching = fbs.filter(row => fbsWarehouseLabel(row.name, row.seller_warehouse_id) === location.name);
    // Equal names do not prove equal identities. Avoid attributing a name bucket to one of several IDs.
    const seller = matching.length === 1 ? matching[0] : undefined;
    return matching.length ? { ...location, type: "fbs" as const, sellerWarehouseId: seller?.seller_warehouse_id,
      wbOfficeId: seller?.wb_office_id } : location;
  });
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
