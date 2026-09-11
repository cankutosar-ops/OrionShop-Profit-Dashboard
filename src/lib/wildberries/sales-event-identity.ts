/**
 * Sales warehouse event identity.
 *
 * A Wildberries sale and a later return share an SRID but are different
 * economic events. They must not collapse onto one row.
 *
 * Identity is the WB-native `saleID` (S… sale, R… return). SRID is an
 * attribute, not the unique key.
 *
 * Amounts stay positive. Returns are marked `is_return` / event_type RETURN
 * and subtracted by the existing V4 callers — do not persist negative quantities.
 */

import type { WbSale } from "@/types/database";

export const WB_SALES_EVENT_CONFLICT = "marketplace_account_id,sale_id";

/** Placeholder for rows persisted before saleID was stored. Never assigned by sync. */
export const UNRESOLVED_SALE_ID_PREFIX = "unresolved:";

export type SalesEventType = "SALE" | "RETURN";

export type SalesEventRow = Omit<WbSale, "id"> & {
  sale_id: string;
  event_type: SalesEventType;
};

export function salesEventTypeFromSaleId(saleId: string): SalesEventType {
  return saleId.startsWith("R") ? "RETURN" : "SALE";
}

export function isUnresolvedSaleId(saleId: string | null | undefined): boolean {
  return String(saleId ?? "").startsWith(UNRESOLVED_SALE_ID_PREFIX);
}

/**
 * Placeholder unique key for pre-saleID rows. Not a business identity —
 * replaced when a WB saleID for the same account + srid + event type arrives.
 */
export function unresolvedSaleId(
  marketplaceAccountId: string,
  srid: string,
  isReturn: boolean
): string {
  const event = isReturn ? "RETURN" : "SALE";
  return `${UNRESOLVED_SALE_ID_PREFIX}${marketplaceAccountId}:${srid}:${event}`;
}

/** WB saleID required. Sync must not invent an identity or reuse a placeholder. */
export function requireWbSaleId(saleId: string | null | undefined): string {
  const id = String(saleId ?? "").trim();
  if (!id) {
    throw new Error("WB saleID is required to persist a sales event");
  }
  if (isUnresolvedSaleId(id)) {
    throw new Error("Refusing to persist an unresolved sale_id from a sync payload");
  }
  return id;
}

export function salesEventKey(marketplaceAccountId: string, saleId: string): string {
  return `${marketplaceAccountId}\0${saleId}`;
}

/**
 * Collapse only identical saleID payloads (re-sync of the same event).
 * A RETURN saleID never replaces a SALE saleID, even when they share an SRID
 * and the return date is later.
 */
export function dedupeSalesEvents<T extends { marketplace_account_id: string; sale_id: string }>(
  rows: readonly T[]
): { rows: T[]; dropped: number } {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    byKey.set(salesEventKey(row.marketplace_account_id, row.sale_id), row);
  }
  return { rows: [...byKey.values()], dropped: rows.length - byKey.size };
}

/**
 * Same saleID may refresh its own row. A return payload must never be applied
 * to a sale identity (and the reverse).
 */
export function saleEventMayUpdate(
  existing: { sale_id: string; is_return: boolean },
  incoming: { sale_id: string; is_return: boolean }
): boolean {
  if (existing.sale_id !== incoming.sale_id) return false;
  if (existing.is_return !== incoming.is_return) return false;
  return true;
}
