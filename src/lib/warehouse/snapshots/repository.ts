/**
 * Sprint 10.6 — Read repositories for KPI snapshots (DB only).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  WarehouseAccountBalanceRecord,
  WarehouseSalesReportSnapshotRecord,
} from "@/lib/warehouse/snapshots/types";
import type { WarehouseMarketplaceType } from "@/lib/warehouse/types";

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getWarehouseAccountBalance(
  marketplaceAccountId: string
): Promise<WarehouseAccountBalanceRecord | null> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("warehouse_account_balance")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId)
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw error;
  }
  if (!data) return null;

  return {
    marketplaceType: String(data.marketplace_type) as WarehouseMarketplaceType,
    companyId: String(data.company_id),
    marketplaceAccountId: String(data.marketplace_account_id),
    currency: (data.currency as string | null) ?? null,
    currentAmount: num(data.current_amount),
    forWithdrawAmount: num(data.for_withdraw_amount),
    observedAt: String(data.observed_at),
  };
}

export async function listWarehouseSalesReportSnapshots(
  marketplaceAccountId: string,
  options?: { from?: string; to?: string }
): Promise<WarehouseSalesReportSnapshotRecord[]> {
  const sb = createAdminClient();
  let query = sb
    .from("warehouse_sales_report_snapshot")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId)
    .order("date_from", { ascending: true });

  // Broad fetch; filter overlaps in application (cash uses create_date, payout uses period).
  if (options?.from) {
    // Keep rows that could overlap [from-60d, to+7d] — caller expands window.
    query = query.gte("date_to", options.from);
  }
  if (options?.to) {
    query = query.lte("date_from", options.to);
  }

  const { data, error } = await query;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }

  return (data ?? []).map((row) => ({
    marketplaceType: String(row.marketplace_type) as WarehouseMarketplaceType,
    companyId: String(row.company_id),
    marketplaceAccountId: String(row.marketplace_account_id),
    reportId: Number(row.report_id),
    dateFrom: String(row.date_from).slice(0, 10),
    dateTo: String(row.date_to).slice(0, 10),
    createDate: String(row.create_date).slice(0, 10),
    currency: (row.currency as string | null) ?? null,
    reportType: row.report_type == null ? null : Number(row.report_type),
    retailAmountSum: num(row.retail_amount_sum),
    forPaySum: num(row.for_pay_sum),
    bankPaymentSum: num(row.bank_payment_sum),
    sellerFinanceName: (row.seller_finance_name as string | null) ?? null,
    observedAt: String(row.observed_at),
  }));
}
