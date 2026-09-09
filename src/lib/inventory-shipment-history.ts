import type {
  WbApiSupplyDetails,
  WbApiSupplyGood,
  WbApiSupplyListItem,
} from "@/lib/wildberries/types";

/** Inbound warehouse shipment line for Inventory History. */
export type InventoryShipmentEntry = {
  id: string;
  shipmentDate: string;
  warehouse: string;
  quantityReceived: number;
  supplyId: number | null;
  preorderId: number | null;
  status: string | null;
  statusId: number | null;
};

export type InventoryShipmentHistoryResult = {
  productId: string;
  /** Null when the scoped product has no WB nm_id. */
  nmId: number | null;
  shipments: InventoryShipmentEntry[];
  /** Present only when a warehouse shipment snapshot source is available. */
  suppliesScanned?: number;
  cached?: boolean;
  source?: "wb_supplies_api";
  /** Explains why the warehouse-only read model has no shipment rows yet. */
  unavailableReason?: string;
};

/** WB supply status IDs relevant to inbound warehouse receipt. */
export const INBOUND_SUPPLY_STATUS_IDS = [4, 5, 6] as const;

const STATUS_LABELS: Record<number, string> = {
  1: "Not planned",
  2: "Planned",
  3: "Shipment allowed",
  4: "Acceptance in progress",
  5: "Accepted",
  6: "Unloaded at gates",
};

export function supplyStatusLabel(statusId: number | null | undefined): string | null {
  if (statusId == null) return null;
  return STATUS_LABELS[statusId] ?? `Status ${statusId}`;
}

/** Prefer accepted qty; fall back to ready-for-sale then planned quantity. */
export function quantityReceivedFromGood(good: WbApiSupplyGood): number {
  const accepted = Number(good.acceptedQuantity ?? 0);
  if (accepted > 0) return accepted;
  const ready = Number(good.readyForSaleQuantity ?? 0);
  if (ready > 0) return ready;
  return Math.max(0, Number(good.quantity ?? 0));
}

export function shipmentDateFromSupply(
  listItem: WbApiSupplyListItem,
  details?: WbApiSupplyDetails | null
): string | null {
  const raw =
    details?.factDate ||
    listItem.factDate ||
    details?.supplyDate ||
    listItem.supplyDate ||
    details?.createDate ||
    listItem.createDate ||
    null;
  return raw;
}

export function warehouseFromDetails(details: WbApiSupplyDetails | null | undefined): string {
  const actual = details?.actualWarehouseName?.trim();
  if (actual) return actual;
  const planned = details?.warehouseName?.trim();
  if (planned) return planned;
  return "—";
}

export function resolveSupplyIdentity(item: WbApiSupplyListItem): {
  id: number;
  isPreorderID: boolean;
} | null {
  if (item.supplyID != null && Number.isFinite(Number(item.supplyID))) {
    return { id: Number(item.supplyID), isPreorderID: false };
  }
  if (item.preorderID != null && Number.isFinite(Number(item.preorderID)) && item.preorderID !== 0) {
    return { id: Number(item.preorderID), isPreorderID: true };
  }
  return null;
}

export function buildShipmentEntry(params: {
  listItem: WbApiSupplyListItem;
  details: WbApiSupplyDetails;
  goodsForProduct: WbApiSupplyGood[];
  nmId: number;
}): InventoryShipmentEntry | null {
  const identity = resolveSupplyIdentity(params.listItem);
  if (!identity) return null;

  const quantityReceived = params.goodsForProduct.reduce(
    (sum, good) => sum + quantityReceivedFromGood(good),
    0
  );
  if (quantityReceived <= 0) return null;

  const shipmentDate = shipmentDateFromSupply(params.listItem, params.details);
  if (!shipmentDate) return null;

  const statusId = params.details.statusID ?? params.listItem.statusID ?? null;

  return {
    id: `supply-${identity.id}-${params.nmId}`,
    shipmentDate,
    warehouse: warehouseFromDetails(params.details),
    quantityReceived,
    supplyId: params.listItem.supplyID ?? null,
    preorderId: params.listItem.preorderID ?? null,
    status: supplyStatusLabel(statusId),
    statusId,
  };
}

export function sortShipmentsNewestFirst(
  entries: InventoryShipmentEntry[]
): InventoryShipmentEntry[] {
  return [...entries].sort((a, b) => b.shipmentDate.localeCompare(a.shipmentDate));
}

/** Default lookback for factDate filter (YYYY-MM-DD). */
export function defaultSupplyDateFrom(now = new Date()): string {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

export function defaultSupplyDateTill(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
