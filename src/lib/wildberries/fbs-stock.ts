import type { WbSellerWarehouse } from "./seller-warehouses";

export type FbsStockRow = {
  marketplace_account_id: string;
  seller_warehouse_id: number;
  chrt_id: number;
  product_id: string;
  warehouse_name: string;
  tech_size: string | null;
  sku: string | null;
  quantity: number | null;
  observed_at: string;
};
export type FbsVariant = { chrt_id?: number | null; product_id: string; tech_size: string | null };

export function parseFbsStocks(raw: unknown, requested: number[]) {
  const stocks = (raw as { stocks?: unknown })?.stocks;
  if (!Array.isArray(stocks)) throw new Error("Invalid FBS stock response shape");
  const expected = new Set(requested);
  const result = new Map<number, { amount: number; sku: string | null }>();
  for (const row of stocks) {
    if (!row || !Number.isSafeInteger(row.chrtId) || !expected.has(row.chrtId) ||
      !Number.isSafeInteger(row.amount) || row.amount < 0 || result.has(row.chrtId)) {
      throw new Error("Invalid or duplicate FBS stock identity/quantity");
    }
    if (row.sku != null && (typeof row.sku !== "string" || row.sku.length > 200)) throw new Error("Invalid FBS sku");
    result.set(row.chrtId, { amount: row.amount, sku: row.sku ?? null });
  }
  return result;
}

/** Complete bounded capture. POST is a WB read; never updates seller inventory. */
export async function captureFbsStocks(accountId: string, token: string,
  warehouses: WbSellerWarehouse[], variants: FbsVariant[]): Promise<FbsStockRow[]> {
  if (!/^[1-9]\d*$/.test(accountId) || !token.trim()) throw new Error("Invalid FBS capture account/credential");
  const byChrt = new Map<number, FbsVariant[]>();
  for (const variant of variants) {
    if (!Number.isSafeInteger(variant.chrt_id) || Number(variant.chrt_id) <= 0) continue;
    const list = byChrt.get(variant.chrt_id!) ?? [];
    list.push(variant);
    byChrt.set(variant.chrt_id!, list);
  }
  const ids = [...byChrt.keys()];
  const active = warehouses.filter(w => w.deliveryType === 1 && !w.isDeleting);
  if (!ids.length || !active.length || ids.length > 25000 || active.length > 20 || ids.length * active.length > 50000) {
    throw new Error("FBS capture scope empty or exceeds bounds");
  }
  if (new Set(active.map(w => w.id)).size !== active.length) throw new Error("Duplicate FBS warehouse");
  const products = new Map<number, { product: string; size: string | null }>();
  for (const [id, list] of byChrt) {
    const productIds = [...new Set(list.map(v => String(v.product_id)))];
    const sizes = [...new Set(list.map(v => v.tech_size?.trim() || null))];
    if (productIds.length !== 1 || !/^[1-9]\d*$/.test(productIds[0]) || sizes.length !== 1) {
      throw new Error("Ambiguous FBS catalog product/size");
    }
    products.set(id, { product: productIds[0], size: sizes[0] });
  }
  const rows: FbsStockRow[] = [];
  const observed = new Date().toISOString();
  const captureDeadline = AbortSignal.timeout(120000);
  for (const warehouse of active) {
    const values = new Map<number, { amount: number; sku: string | null }>();
    for (let offset = 0; offset < ids.length; offset += 1000) {
      captureDeadline.throwIfAborted();
      const batch = ids.slice(offset, offset + 1000);
      const response = await fetch(`https://marketplace-api.wildberries.ru/api/v3/stocks/${warehouse.id}`, {
        method: "POST", headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ chrtIds: batch }), redirect: "error",
        signal: AbortSignal.any([captureDeadline, AbortSignal.timeout(20000)]),
      });
      if (!response.ok) throw new Error(`WB FBS inventory HTTP ${response.status}`);
      for (const [id, value] of parseFbsStocks(await response.json(), batch)) values.set(id, value);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    for (const id of ids) {
      const product = products.get(id)!;
      const value = values.get(id);
      rows.push({ marketplace_account_id: accountId, seller_warehouse_id: warehouse.id, chrt_id: id,
        product_id: product.product, warehouse_name: warehouse.name, tech_size: product.size,
        sku: value?.sku ?? null, quantity: value?.amount ?? null, observed_at: observed });
    }
  }
  captureDeadline.throwIfAborted();
  return rows;
}

export function summarizeFbsStock(rows: FbsStockRow[]) {
  const reported = rows.filter(row => row.quantity !== null);
  return {
    quantity: reported.length ? reported.reduce((sum, row) => sum + row.quantity!, 0) : null,
    incomplete: rows.some(row => row.quantity === null),
    observedAt: rows.length ? rows.map(row => row.observed_at).sort()[0] : null,
  };
}

export function indexFbsStockByProduct(rows: FbsStockRow[]) {
  const grouped = new Map<string, FbsStockRow[]>();
  for (const row of rows) {
    const key = String(row.product_id);
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return new Map([...grouped].map(([id, group]) => [id, summarizeFbsStock(group)]));
}
