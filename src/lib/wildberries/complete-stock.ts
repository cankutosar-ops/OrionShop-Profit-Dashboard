import type { WbWarehouseStockItem } from "./types";
import type { MarketplaceStockDto } from "@/lib/warehouse/adapters/marketplace-adapter";
import { getSyncExecutionContext } from "@/lib/commercial-continuity/sync-execution-context";

// Never serialize arbitrary source strings/objects: they may contain credentials
// or unrelated payload data. Only bounded numeric representations are reportable.
function safeNumericValue(value: unknown): unknown {
  if (value === undefined) return "[undefined]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string" && value.length <= 80 &&
      (/^\s*$/.test(value) || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ||
       /^0(?:x[\da-f]+|b[01]+|o[0-7]+)$/i.test(value.trim()))) return value;
  return "[non-numeric or oversized value omitted]";
}

type NumericContext = { itemIndex: number; warehouseIndex: number;
  nmId: unknown; chrtId: unknown; warehouseId: unknown; sourceItemsFetched: number };

function integer(value: unknown, minimum: number, field: string, context: NumericContext): number {
  const fail = (prefix: string, reason: string, n?: number): never => {
    throw new Error(`${prefix}: ${JSON.stringify({
      accountId: safeNumericValue(getSyncExecutionContext()?.marketplaceAccountId),
      endpoint: "/api/analytics/v1/stocks-report/wb-warehouses",
      stage: "flattenCompleteStock.integer", field, ...context,
      nmId: safeNumericValue(context.nmId), chrtId: safeNumericValue(context.chrtId),
      warehouseId: safeNumericValue(context.warehouseId), rawType: typeof value,
      rawValue: safeNumericValue(value), finite: n === undefined ? null : Number.isFinite(n),
      integer: n === undefined ? null : Number.isInteger(n),
      safeInteger: n === undefined ? null : Number.isSafeInteger(n), minimum, reason,
    })}`);
  };
  if (value == null || value === "" || typeof value === "boolean") fail("Missing stock number", "missing_or_boolean");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < minimum) fail("Invalid stock number",
    !Number.isFinite(n) ? "non_finite" : !Number.isInteger(n) ? "fractional" :
      !Number.isSafeInteger(n) ? "unsafe_integer" : "below_minimum", n);
  return n;
}

/** Reject the whole dataset, never silently skip a malformed source grain. */
export function flattenCompleteStock(items: WbWarehouseStockItem[]): WbWarehouseStockItem[] {
  if (!Array.isArray(items) || !items.length) throw new Error("Stock source empty/unavailable; existing stock retained");
  const result: WbWarehouseStockItem[] = [];
  const identities = new Set<string>();
  for (const [itemIndex, item] of items.entries()) {
    if (!item || typeof item !== "object") throw new Error("Malformed stock row");
    if (item.warehouses !== undefined && (!Array.isArray(item.warehouses) || !item.warehouses.length)) {
      throw new Error("Incomplete warehouse list");
    }
    for (const [warehouseIndex, wh] of (item.warehouses ?? [item]).entries()) {
      if (!wh || typeof wh !== "object") throw new Error("Malformed warehouse row");
      const context: NumericContext = { itemIndex, warehouseIndex, sourceItemsFetched: items.length,
        nmId: wh.nmId ?? item.nmId, chrtId: wh.chrtId ?? item.chrtId,
        warehouseId: wh.warehouseId ?? item.warehouseId };
      const nmId = integer(context.nmId, 1, "nmId", context);
      const chrtId = integer(context.chrtId, 1, "chrtId", context);
      const warehouseId = wh.warehouseId ?? item.warehouseId;
      if (warehouseId != null) integer(warehouseId, 1, "warehouseId", context);
      const warehouseName = wh.warehouseName ?? item.warehouseName;
      if (warehouseName != null && typeof warehouseName !== "string") throw new Error("Invalid warehouse name");
      if (warehouseId == null && !warehouseName?.trim()) throw new Error("Missing warehouse identity");
      const key = `${nmId}:${chrtId}:${warehouseId == null ? `name:${warehouseName?.trim()}` : `id:${warehouseId}`}`;
      if (identities.has(key)) throw new Error("Duplicate stock identity / overlapping pagination");
      identities.add(key);
      result.push({ nmId, chrtId, warehouseId, warehouseName,
        quantity: integer(wh.quantity, 0, "quantity", context),
        inWayToClient: integer(wh.inWayToClient ?? item.inWayToClient ?? 0, 0, "inWayToClient", context),
        inWayFromClient: integer(wh.inWayFromClient ?? item.inWayFromClient ?? 0, 0, "inWayFromClient", context),
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
