import type { AdminClient } from "@/lib/supabase/admin";
import { getSyncExecutionContext } from "@/lib/commercial-continuity/sync-execution-context";
import type { MarketplaceStockDto } from "@/lib/warehouse/adapters/marketplace-adapter";

type CatalogVariant = {
  nm_id: number | null;
  chrt_id: number | null;
  tech_size: string | null;
  barcode: string | null;
};

export type CanonicalStockRow = {
  marketplace_account_id: string;
  nm_id: number;
  chrt_id: number;
  warehouse_key: string;
  warehouse_id: number | null;
  warehouse_name: string;
  quantity: number;
  in_way_to_client: number;
  in_way_from_client: number;
  barcode: string | null;
  tech_size: string | null;
  observed_at: string;
  updated_at: string;
};

function positiveId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid ${label}: ${value}`);
  return id;
}

function nonnegativeQuantity(value: unknown, label: string): number {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid ${label}: ${value}`);
  return n;
}

function warehouseIdentity(item: MarketplaceStockDto): {
  key: string;
  id: number | null;
  name: string;
} {
  const name = item.warehouseCode?.trim() ?? "";
  const id = item.warehouseId == null || item.warehouseId === 0
    ? null : positiveId(item.warehouseId, "warehouse ID");
  if (!id && (!name || name === "_")) throw new Error("Stock observation has no warehouse identity");
  return { key: id ? `id:${id}` : `name:${name}`, id, name: name && name !== "_" ? name : String(id) };
}

async function persistedCatalog(client: AdminClient, accountId: string): Promise<Map<string, CatalogVariant[]>> {
  const variants = new Map<string, CatalogVariant[]>();
  for (let from = 0;; from += 1000) {
    const { data, error } = await client.from("product_variants")
      .select("nm_id,chrt_id,tech_size,barcode")
      .eq("marketplace_account_id", accountId)
      .not("chrt_id", "is", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Canonical stock catalog lookup failed: ${error.message}`);
    const page = (data ?? []) as CatalogVariant[];
    for (const variant of page) {
      const key = `${variant.nm_id}:${variant.chrt_id}`;
      const list = variants.get(key) ?? [];
      list.push(variant);
      variants.set(key, list);
    }
    if (page.length < 1000) break;
  }
  return variants;
}

function uniqueEnrichment(values: Array<string | null | undefined>): string | null {
  const distinct = [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))];
  return distinct.length === 1 ? distinct[0] : null;
}

/** Persist current Analytics observations; never reads or mutates legacy wb_stock. */
export async function persistCanonicalCurrentStocks(
  accountId: string,
  items: MarketplaceStockDto[],
  client: AdminClient
): Promise<number> {
  positiveId(accountId, "marketplace account ID");
  if (!items.length) throw new Error("Empty stock is not authoritative; existing stock retained");
  const catalog = items.length ? await persistedCatalog(client, accountId) : new Map<string, CatalogVariant[]>();
  const now = new Date().toISOString();
  const rows = new Map<string, CanonicalStockRow>();

  for (const item of items) {
    const nmId = positiveId(item.externalProductId, "nm ID");
    const chrtId = positiveId(item.externalVariantId, "chrt ID");
    const warehouse = warehouseIdentity(item);
    const quantity = nonnegativeQuantity(item.quantity, "stock quantity");
    const inWayToClient = nonnegativeQuantity(item.inWayToClient, "in-way-to-client");
    const inWayFromClient = nonnegativeQuantity(item.inWayFromClient, "in-way-from-client");
    const observedAt = item.observedAt && Number.isFinite(Date.parse(item.observedAt))
      ? item.observedAt : now;
    const key = `${accountId}:${nmId}:${chrtId}:${warehouse.key}`;
    const variants = catalog.get(`${nmId}:${chrtId}`) ?? [];
    const row: CanonicalStockRow = {
      marketplace_account_id: accountId,
      nm_id: nmId,
      chrt_id: chrtId,
      warehouse_key: warehouse.key,
      warehouse_id: warehouse.id,
      warehouse_name: warehouse.name,
      quantity,
      in_way_to_client: inWayToClient,
      in_way_from_client: inWayFromClient,
      barcode: uniqueEnrichment(variants.map((variant) => variant.barcode)),
      tech_size: uniqueEnrichment(variants.map((variant) => variant.tech_size)),
      observed_at: observedAt,
      updated_at: now,
    };
    const prior = rows.get(key);
    if (prior && (prior.quantity !== quantity || prior.in_way_to_client !== inWayToClient ||
      prior.in_way_from_client !== inWayFromClient)) {
      throw new Error(`Conflicting duplicate current stock identity: ${key}`);
    }
    rows.set(key, row);
  }

  const values = [...rows.values()];
  getSyncExecutionContext()?.abortSignal?.throwIfAborted();
  // The hand-maintained Database type intentionally leaves RPC names unlisted.
  const rpcClient = client as unknown as { rpc(name: string, args: {
    p_account_id: string;
    p_rows: CanonicalStockRow[];
  }): Promise<{ data: number | null; error: { message: string } | null }> };
  const { data, error } = await rpcClient.rpc("replace_wb_current_stocks_verified", {
    p_account_id: accountId,
    p_rows: values,
  });
  if (error) throw new Error(`Canonical stock replacement failed: ${error.message}`);
  if (data !== values.length) throw new Error("Canonical stock persisted count mismatch");
  return values.length;
}
