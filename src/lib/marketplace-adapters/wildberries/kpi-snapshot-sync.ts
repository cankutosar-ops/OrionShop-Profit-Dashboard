/**
 * Sprint 10.6 — Persist KPI snapshots from marketplace APIs (ingestion only).
 * Called exclusively from warehouse sync orchestration.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { expandSalesReportFetchWindow } from "@/lib/cash-received";
import { WbApiClient } from "@/lib/wildberries/api-client";
import type { WarehouseScope } from "@/lib/warehouse/types";

function parseMoney(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number.parseFloat(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export type SyncWarehouseKpiSnapshotsResult = {
  balanceUpserted: boolean;
  reportsUpserted: number;
  errors: string[];
};

/**
 * Fetch balance + sales reports from WB and upsert into warehouse snapshot tables.
 */
export async function syncWildberriesKpiSnapshots(input: {
  scope: WarehouseScope;
  apiKey: string;
  historyFrom?: string;
  historyTo?: string;
}): Promise<SyncWarehouseKpiSnapshotsResult> {
  const errors: string[] = [];
  const client = new WbApiClient(input.apiKey);
  const sb = createAdminClient();
  const observedAt = new Date().toISOString();
  let balanceUpserted = false;
  let reportsUpserted = 0;

  try {
    const balance = await client.fetchAccountBalance();
    const { error } = await sb.from("warehouse_account_balance").upsert(
      {
        marketplace_type: input.scope.marketplaceType,
        company_id: input.scope.companyId,
        marketplace_account_id: input.scope.marketplaceAccountId,
        currency: balance.currency ?? null,
        current_amount: balance.current ?? null,
        for_withdraw_amount: balance.for_withdraw ?? null,
        observed_at: observedAt,
        updated_at: observedAt,
        meta: { source: "wb_account_balance" },
      } as never,
      { onConflict: "marketplace_account_id" }
    );
    if (error) errors.push(`balance: ${error.message}`);
    else balanceUpserted = true;
  } catch (err) {
    errors.push(`balance: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const to = input.historyTo ?? new Date().toISOString().slice(0, 10);
    const from =
      input.historyFrom ??
      new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { fetchFrom, fetchTo } = expandSalesReportFetchWindow(from, to);
    const reports = await client.fetchSalesReportsList(fetchFrom, fetchTo, "weekly");
    if (reports.length) {
      const rows = reports.map((report) => ({
        marketplace_type: input.scope.marketplaceType,
        company_id: input.scope.companyId,
        marketplace_account_id: input.scope.marketplaceAccountId,
        report_id: report.reportId,
        date_from: String(report.dateFrom).slice(0, 10),
        date_to: String(report.dateTo).slice(0, 10),
        create_date: String(report.createDate).slice(0, 10),
        currency: report.currency ?? null,
        report_type: report.reportType ?? null,
        retail_amount_sum: parseMoney(report.retailAmountSum),
        for_pay_sum: parseMoney(report.forPaySum),
        bank_payment_sum: parseMoney(report.bankPaymentSum),
        seller_finance_name: report.sellerFinanceName ?? null,
        observed_at: observedAt,
        updated_at: observedAt,
        meta: { source: "wb_sales_reports_list" },
      }));
      const { error } = await sb
        .from("warehouse_sales_report_snapshot")
        .upsert(rows as never, { onConflict: "marketplace_account_id,report_id" });
      if (error) errors.push(`reports: ${error.message}`);
      else reportsUpserted = rows.length;
    }
  } catch (err) {
    errors.push(`reports: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { balanceUpserted, reportsUpserted, errors };
}

export async function testWildberriesConnection(apiKey: string): Promise<void> {
  const client = new WbApiClient(apiKey);
  await client.fetchOrders(new Date(Date.now() - 86400000).toISOString());
}
