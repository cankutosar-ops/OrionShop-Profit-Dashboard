import type { WbWarehouseStockItem } from "./types";
import type { MarketplaceStockDto } from "@/lib/warehouse/adapters/marketplace-adapter";

function integer(value: unknown, minimum: number): number {
  if (value == null || value === "" || typeof value === "boolean") throw new Error("Missing stock number");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < minimum) throw new Error("Invalid stock number");
  return n;
}

/** Reject the whole dataset, never silently skip a malformed source grain. */
export function flattenCompleteStock(items: WbWarehouseStockItem[]): WbWarehouseStockItem[] {
  if (!Array.isArray(items) || !items.length) throw new Error("Stock source empty/unavailable; existing stock retained");
  const result: WbWarehouseStockItem[] = [];
  const identities = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") throw new Error("Malformed stock row");
    if (item.warehouses !== undefined && (!Array.isArray(item.warehouses) || !item.warehouses.length)) {
      throw new Error("Incomplete warehouse list");
    }
    for (const wh of item.warehouses ?? [item]) {
      if (!wh || typeof wh !== "object") throw new Error("Malformed warehouse row");
      const nmId = integer(wh.nmId ?? item.nmId, 1);
      const chrtId = integer(wh.chrtId ?? item.chrtId, 1);
      const warehouseId = wh.warehouseId ?? item.warehouseId;
      if (warehouseId != null) integer(warehouseId, 1);
      const warehouseName = wh.warehouseName ?? item.warehouseName;
      if (warehouseName != null && typeof warehouseName !== "string") throw new Error("Invalid warehouse name");
      if (warehouseId == null && !warehouseName?.trim()) throw new Error("Missing warehouse identity");
      const key = `${nmId}:${chrtId}:${warehouseId == null ? `name:${warehouseName?.trim()}` : `id:${warehouseId}`}`;
      if (identities.has(key)) throw new Error("Duplicate stock identity / overlapping pagination");
      identities.add(key);
      result.push({ nmId, chrtId, warehouseId, warehouseName,
        quantity: integer(wh.quantity, 0),
        inWayToClient: integer(wh.inWayToClient ?? item.inWayToClient ?? 0, 0),
        inWayFromClient: integer(wh.inWayFromClient ?? item.inWayFromClient ?? 0, 0),
      });
    }
  }
  return result;
}

export function mapCompleteStock(items: WbWarehouseStockItem[]): MarketplaceStockDto[] {
  const observedAt = new Date().toISOString();
  return flattenCompleteStock(items).map(row => ({
    externalProductId: String(row.nmId), externalVariantId: String(row.chrtId),
    warehouseId: row.warehouseId ?? null, warehouseCode: row.warehouseName ?? "",
    quantity: row.quantity!, inWayToClient: row.inWayToClient,
    inWayFromClient: row.inWayFromClient, observedAt, raw: row,
  }));
}
