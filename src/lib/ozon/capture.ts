import { randomUUID } from "node:crypto";
import type { OzonReadEntity, OzonReadPage } from "./read-client";

export type OzonSourceCapture = {
  accountId: string;
  entity: OzonReadEntity;
  snapshotId: string;
  observedAt: string;
  items: Record<string, unknown>[];
};

export async function captureOzonSource(input: {
  accountId: string;
  entity: OzonReadEntity;
  readPage: (entity: OzonReadEntity, cursor: string, limit: number) => Promise<OzonReadPage>;
  /** Must atomically insert the immutable snapshot and publish its scoped pointer. */
  publish: (capture: OzonSourceCapture) => Promise<number>;
  maxPages?: number;
  allowEmpty?: boolean;
}) {
  if (!/^[1-9]\d*$/.test(input.accountId)) throw new Error("invalid_ozon_account_id");
  const maxPages = input.maxPages ?? 50;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error("invalid_page_budget");
  const observedAt = new Date().toISOString();
  const items: Record<string, unknown>[] = [];
  const products = new Set<number>();
  const cursors = new Set<string>();
  let cursor = "";
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const page = await input.readPage(input.entity, cursor, 100);
    if (page.entity !== input.entity) throw new Error("ozon_entity_mismatch");
    if (page.items.length === 0) {
      if (!page.exhausted) throw new Error("ozon_exhaustion_unproven");
      if (items.length === 0 && !input.allowEmpty) throw new Error("ozon_empty_capture_requires_review");
      const count = await input.publish({
        accountId: input.accountId, entity: input.entity, snapshotId: randomUUID(), observedAt, items,
      });
      if (count !== items.length) throw new Error("ozon_persisted_count_mismatch");
      return { rowsFetched: items.length, rowsPersisted: count, pagesFetched: pageIndex + 1, observedAt };
    }
    if (page.exhausted || !page.nextCursor || page.nextCursor === cursor || cursors.has(page.nextCursor)) {
      throw new Error("ozon_cursor_contract_failure");
    }
    for (const item of page.items) {
      const id = item.product_id;
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || products.has(id)) {
        throw new Error("ozon_product_identity_invalid_or_duplicate");
      }
      products.add(id);
      items.push(item); // Preserve supplied nested stock/price dimensions; no invented mapping.
    }
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error("ozon_page_budget_exhausted"); // No partial publication.
}
