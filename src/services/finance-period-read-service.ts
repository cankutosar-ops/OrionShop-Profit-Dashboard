import type { SupabaseClient } from "@/lib/supabase/server";
import { getReadBudgetSignal } from "@/lib/supabase/read-budget";
import { recordPerfEvent } from "@/lib/perf/perf-recorder";
import { fetchFinanceInRange } from "@/services/persisted-query-service";
import type { ScopedDateRange, WbFinance } from "@/types/database";

type PeriodRows = {
  version: number;
  accountId: string;
  from: string;
  to: string;
  sourceRows: number;
  emittedRows: number;
  rows: WbFinance[];
};

/** Period totals only. Ingestion, Tax evidence and transaction detail retain raw reads. */
export async function fetchFinancePeriodRows(
  scope: ScopedDateRange,
  client: SupabaseClient,
  options: { columns: string; productIds?: string[] }
): Promise<WbFinance[]> {
  const started = Date.now();
  let query = client.rpc("orion_finance_period_rows", {
    p_account_id: scope.marketplaceAccountId,
    p_from: scope.from,
    p_to: scope.to,
    p_product_ids: options.productIds ?? null,
  });
  const signal = getReadBudgetSignal();
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) {
    // Safe additive rollout: only an absent function uses the existing raw path.
    // Timeouts, denied access and malformed results must not fan out into more work.
    if (error.code !== "PGRST202" && error.code !== "42883") {
      throw new Error(`Failed to load Finance period: ${error.message}`);
    }
    return fetchFinanceInRange(scope, client, {
      ...options, compactMetadata: scope.marketplaceAccountId === "6",
    });
  }
  const result = data as PeriodRows | null;
  if (!result || result.version !== 1 || String(result.accountId) !== scope.marketplaceAccountId ||
      result.from !== scope.from || result.to !== scope.to ||
      !Number.isSafeInteger(result.sourceRows) || !Number.isSafeInteger(result.emittedRows) ||
      result.emittedRows < 0 || result.sourceRows < result.emittedRows ||
      !Array.isArray(result.rows) || result.rows.length !== result.emittedRows ||
      result.rows.some(row => !row || String(row.marketplace_account_id) !== scope.marketplaceAccountId ||
        row.operation_date < scope.from || row.operation_date > scope.to || row.amount == null ||
        (options.productIds && row.product_id != null && !options.productIds.includes(String(row.product_id))) ||
        !Number.isFinite(Number(row.amount)) ||
        (row.raw_amount != null && !Number.isFinite(Number(row.raw_amount))))) {
    throw new Error("Incomplete or invalid Finance period result");
  }
  if (new Set(result.rows.map(row => row.id)).size !== result.rows.length) {
    throw new Error("Duplicate Finance period result");
  }
  recordPerfEvent({
    category: "sql", name: "sql.wb_finance.period", durationMs: Date.now() - started,
    meta: { account: scope.marketplaceAccountId, sourceRows: result.sourceRows, rows: result.emittedRows, pages: 1 },
  });
  return result.rows;
}
