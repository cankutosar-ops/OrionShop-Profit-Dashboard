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
