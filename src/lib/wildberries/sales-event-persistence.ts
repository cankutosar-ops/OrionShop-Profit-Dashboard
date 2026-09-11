/**
 * Idempotent wb_sales persistence keyed by WB saleID.
 * A later RETURN inserts/updates only the RETURN event.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  dedupeSalesEvents,
  isUnresolvedSaleId,
  UNRESOLVED_SALE_ID_PREFIX,
  WB_SALES_EVENT_CONFLICT,
  type SalesEventRow,
} from "@/lib/wildberries/sales-event-identity";

const DEFAULT_BATCH = 200;

export async function salesSchemaHasSaleIdColumn(supabase: AdminClient): Promise<boolean> {
  const { error } = await supabase.from("wb_sales").select("sale_id").limit(1);
  return !error;
}

/**
 * Upsert by (marketplace_account_id, sale_id).
 * After a native event is stored, delete only the unresolved placeholder of the
 * same account + srid + event type. A RETURN never removes a SALE placeholder.
 */
export async function persistSalesEvents(
  supabase: AdminClient,
  rows: SalesEventRow[],
  options?: { batchSize?: number }
): Promise<{ upserted: number; dropped: number; retiredPlaceholders: number; errors: string[] }> {
  const { rows: deduped, dropped } = dedupeSalesEvents(rows);
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;
  const errors: string[] = [];
  let upserted = 0;
  const persisted: SalesEventRow[] = [];

  for (let i = 0; i < deduped.length; i += batchSize) {
    const batch = deduped.slice(i, i + batchSize);
    const { error } = await supabase.from("wb_sales").upsert(batch, {
      onConflict: WB_SALES_EVENT_CONFLICT,
    });
    if (error) {
      errors.push(`wb_sales batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      continue;
    }
    upserted += batch.length;
    persisted.push(...batch);
  }

  if (!persisted.length) {
    return { upserted, dropped, retiredPlaceholders: 0, errors };
  }

  const retired = await retireUnresolvedPlaceholders(supabase, persisted);
  if (retired.error) errors.push(retired.error);

  return {
    upserted,
    dropped,
    retiredPlaceholders: retired.retired,
    errors,
  };
}

async function retireUnresolvedPlaceholders(
  supabase: AdminClient,
  persisted: readonly SalesEventRow[]
): Promise<{ retired: number; error?: string }> {
  const native = persisted.filter((row) => !isUnresolvedSaleId(row.sale_id));
  if (!native.length) return { retired: 0 };

  let retired = 0;
  const groups = new Map<string, { account: string; isReturn: boolean; srids: string[] }>();
  for (const row of native) {
    const key = `${row.marketplace_account_id}\0${row.is_return ? "1" : "0"}`;
    const group = groups.get(key) ?? {
      account: row.marketplace_account_id,
      isReturn: row.is_return,
      srids: [],
    };
    group.srids.push(row.srid);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const srids = [...new Set(group.srids)];
    for (let i = 0; i < srids.length; i += 200) {
      const chunk = srids.slice(i, i + 200);
      const { error, count } = await supabase
        .from("wb_sales")
        .delete({ count: "exact" })
        .eq("marketplace_account_id", group.account)
        .eq("is_return", group.isReturn)
        .in("srid", chunk)
        .like("sale_id", `${UNRESOLVED_SALE_ID_PREFIX}%`);
      if (error) return { retired, error: error.message };
      retired += count ?? 0;
    }
  }

  return { retired };
}
