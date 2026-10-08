export type WbSellerWarehouse = {
  id: number;
  name: string;
  officeId: number;
  deliveryType: number;
  isDeleting: boolean | null;
  isProcessing: boolean | null;
};

/** Validate the entire catalog before any persistence; do not guess source identities. */
export function parseSellerWarehouses(raw: unknown): WbSellerWarehouse[] {
  if (!Array.isArray(raw)) throw new Error("Invalid WB seller warehouse catalog shape");
  const ids = new Set<number>();
  const id = (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error("Invalid WB seller warehouse numeric identity");
    }
    return value;
  };
  const flag = (value: unknown) => {
    if (value == null) return null;
    if (typeof value !== "boolean") throw new Error("Invalid WB seller warehouse state");
    return value;
  };
  return raw.map(row => {
    if (!row || typeof row !== "object" || typeof row.name !== "string" || !row.name.trim()) {
      throw new Error("Invalid WB seller warehouse name");
    }
    const warehouseId = id(row.id);
    if (ids.has(warehouseId)) throw new Error("Duplicate WB seller warehouse identity");
    ids.add(warehouseId);
    return { id: warehouseId, name: row.name.trim(), officeId: id(row.officeId),
      deliveryType: id(row.deliveryType), isDeleting: flag(row.isDeleting), isProcessing: flag(row.isProcessing) };
  });
}

/** Single bounded read. No automatic retries, status actions, stock updates, or order writes. */
export async function fetchSellerWarehouses(token: string): Promise<WbSellerWarehouse[]> {
  if (!token.trim()) throw new Error("WB seller warehouse credential is missing");
  const response = await fetch("https://marketplace-api.wildberries.ru/api/v3/warehouses", {
    method: "GET", headers: { Authorization: token }, redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`WB seller warehouse catalog HTTP ${response.status}`);
  return parseSellerWarehouses(await response.json());
}
