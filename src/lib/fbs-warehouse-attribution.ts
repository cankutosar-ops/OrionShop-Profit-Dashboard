export function fbsWarehouseLabel(name: string, id: number | string) { return `${name.trim()} [FBS #${id}]`; }

export function attributeFbsWarehouses<T extends { srid?: string | null; nm_id?: number | null; warehouse?: string | null }>(
  rows: T[], evidence: {rid: string; nm_id: number; seller_warehouse_id: number}[], catalog: {seller_warehouse_id: number; name: string}[]
) {
  const byRid = new Map(evidence.map(row => [row.rid, row]));
  const warehouses = new Map(catalog.map(row => [Number(row.seller_warehouse_id), row.name]));
  let attributed = 0;
  const result = rows.map(row => {
    const proof = row.srid ? byRid.get(row.srid) : undefined;
    if (!proof || Number(row.nm_id) !== Number(proof.nm_id)) return row;
    const name = warehouses.get(Number(proof.seller_warehouse_id));
    if (!name) return row;
    attributed++;
    return {...row, warehouse: fbsWarehouseLabel(name, proof.seller_warehouse_id)};
  });
  return { rows: result, attributed };
}
