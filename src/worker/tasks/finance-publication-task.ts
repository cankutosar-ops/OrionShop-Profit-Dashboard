import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFinanceIncrementalStateStore, type FinanceIncrementalStateStore } from "@/lib/finance-incremental/state";
import { applyReportsPacingAfterRequest, reportsIncrementalBlockedUntil } from "@/lib/finance-incremental/rate-limit";
import { isFinanceHistoricalRecoveryActive } from "@/lib/finance-recovery/coordination";
import { assertFinanceV1LiveAllowed, assertFinanceV1TokenReady } from "@/lib/wildberries/finance-v1";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import { listWorkerAccounts } from "../accounts";
import type { WorkerLogger } from "../logger";
import type { WorkerAccountTaskResult } from "../types";

export const PUBLICATION_REFRESH_MS = 12 * 60 * 60 * 1000;
const MIN_GAP_MS = 70_000;
type Account = { id: string; companyId: string; apiKey: string };
export type PublicationTaskDeps = {
  listAccounts: typeof listWorkerAccounts;
  loadAccount: (id: string) => Promise<Account>;
  lastObservedAt: (id: string, from: string) => Promise<string | null>;
  saveReports: (rows: Record<string, unknown>[]) => Promise<void>;
  request: (token: string, from: string, to: string) => Promise<Response>;
  store: FinanceIncrementalStateStore;
  now: () => number;
  assertAccess: (token: string) => void;
  recoveryActive: (id: string) => boolean;
};

const moneyFields = {
  retail_amount_sum: "retailAmountSum", for_pay_sum: "forPaySum", bank_payment_sum: "bankPaymentSum",
  delivery_service_sum: "deliveryServiceSum", paid_storage_sum: "paidStorageSum",
  paid_acceptance_sum: "paidAcceptanceSum", deduction_sum: "deductionSum", penalty_sum: "penaltySum",
  additional_payment_sum: "additionalPaymentSum", cashback_amount_sum: "cashbackAmountSum",
  cashback_discount_sum: "cashbackDiscountSum", cashback_commission_change_sum: "cashbackCommissionChangeSum",
  payment_schedule: "paymentSchedule",
};
function day(value: unknown): string {
  const result = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) ||
      new Date(result).toISOString().slice(0, 10) !== result) throw Error("Invalid publication date");
  return result;
}
function money(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(parsed)) throw Error("Invalid publication amount");
  return parsed;
}
export function publicationSnapshotRows(body: unknown, account: Account, from: string, to: string, observedAt: string) {
  if (!Array.isArray(body) || body.length >= 1000) throw Error("Incomplete or malformed publication page");
  const ids = new Set<number>();
  return body.map((report: Record<string, unknown>) => {
    const reportFrom = day(report.dateFrom), reportTo = day(report.dateTo), created = day(report.createDate);
    if (!Number.isSafeInteger(report.reportId) || Number(report.reportId) <= 0 ||
        ids.has(Number(report.reportId)) || reportFrom > reportTo || reportTo < from || reportFrom > to) {
      throw Error("Publication identity/interval mismatch");
    }
    ids.add(Number(report.reportId));
    return {
      marketplace_type: "wildberries", company_id: account.companyId, marketplace_account_id: account.id,
      report_id: report.reportId, date_from: reportFrom, date_to: reportTo, create_date: created,
      currency: report.currency ?? null, report_type: report.reportType ?? null,
      seller_finance_name: report.sellerFinanceName ?? null, observed_at: observedAt, updated_at: observedAt,
      meta: { source: "wb_sales_reports_list" },
      ...Object.fromEntries(Object.entries(moneyFields).map(([db, source]) => [db, money(report[source])])),
    };
  });
}

function productionDeps(): PublicationTaskDeps {
  return {
    listAccounts: listWorkerAccounts, store: createSupabaseFinanceIncrementalStateStore(), now: Date.now,
    recoveryActive: isFinanceHistoricalRecoveryActive,
    assertAccess(token) { assertFinanceV1LiveAllowed(); assertFinanceV1TokenReady(token); },
    async loadAccount(id) {
      const account = await getMarketplaceAccountForSync(id);
      if (String(account.id) !== id || account.marketplace !== "wildberries") throw Error("Publication account mismatch");
      return { id, companyId: String(account.company_id), apiKey: account.apiKey };
    },
    async lastObservedAt(id, from) {
      const { data, error } = await createAdminClient().from("warehouse_sales_report_snapshot")
        .select("observed_at").eq("marketplace_account_id", Number(id)).gte("date_to", from)
        .order("observed_at", { ascending: false }).limit(1);
      if (error || !Array.isArray(data)) throw Error("Publication freshness read failed");
      return data[0]?.observed_at ?? null;
    },
    async saveReports(rows) {
      if (!rows.length) return;
      const { error } = await createAdminClient().from("warehouse_sales_report_snapshot")
        .upsert(rows as never, { onConflict: "marketplace_account_id,report_id" });
      if (error) throw Error(`Publication snapshot save failed: ${error.code}`);
    },
    request(token, from, to) {
      return fetch("https://finance-api.wildberries.ru/api/finance/v1/sales-reports/list", {
        method: "POST", headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom: from, dateTo: to, period: "weekly", limit: 1000, offset: 0 }),
        signal: AbortSignal.timeout(30_000),
      });
    },
  };
}

/** Independent publication producer. No detail rows/cursor/formulas are changed here. */
export async function runFinancePublicationWorkerTask(input: {
  accountIds?: readonly string[] | null; deadlineMs: number; force?: boolean;
  logger: WorkerLogger; deps?: Partial<PublicationTaskDeps>;
}): Promise<WorkerAccountTaskResult[]> {
  const deps = { ...productionDeps(), ...input.deps };
  const accounts = await deps.listAccounts({ accountIds: input.accountIds });
  const results: WorkerAccountTaskResult[] = [];
  for (const account of accounts) {
    const started = deps.now();
    let outcome: WorkerAccountTaskResult["outcome"] = "skipped", detail = "budget_exhausted";
    let count = 0, rateLimited = false;
    let leased: Awaited<ReturnType<FinanceIncrementalStateStore["acquireLease"]>> = null;
    const owner = randomUUID();
    try {
      if (started >= input.deadlineMs) continue;
      if (deps.recoveryActive(account.id)) { detail = "historical_recovery_active"; continue; }
      const to = new Date(started).toISOString().slice(0, 10);
      const from = new Date(started - 21 * 86400000).toISOString().slice(0, 10);
      const observed = await deps.lastObservedAt(account.id, from);
      if (observed && !Number.isFinite(Date.parse(observed))) throw Error("Invalid stored publication observation");
      if (!input.force && observed && started - Date.parse(observed) < PUBLICATION_REFRESH_MS) {
        detail = "publication_fresh"; continue;
      }
      const record = await deps.loadAccount(account.id);
      if (record.id !== account.id || !/^[1-9]\d*$/.test(record.companyId)) throw Error("Publication scope mismatch");
      deps.assertAccess(record.apiKey);
      leased = await deps.store.acquireLease(account.id, owner);
      if (!leased) { detail = "lease_busy"; continue; }
      const blocked = reportsIncrementalBlockedUntil(leased, deps.now());
      if (blocked) { detail = `reports_cooldown:${blocked}`; continue; }
      const requestedAt = deps.now();
      leased = { ...leased, reportsLastRequestAt: new Date(requestedAt).toISOString(),
        reportsNextRequestNotBefore: new Date(requestedAt + MIN_GAP_MS).toISOString(), updatedAt: new Date(requestedAt).toISOString() };
      if (!await deps.store.commitLease(leased, owner, false)) throw Error("Publication lease lost before HTTP");
      const response = await deps.request(record.apiKey, from, to);
      const numberHeader = (name: string) => {
        const value = response.headers.get(name); if (value == null || value === "") return null;
        const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null;
      };
      leased = applyReportsPacingAfterRequest({ state: leased, nowMs: deps.now(), httpStatus: response.status,
        remaining: numberHeader("X-Ratelimit-Remaining"), limit: numberHeader("X-Ratelimit-Limit"),
        resetSeconds: numberHeader("X-Ratelimit-Reset"), retrySeconds: numberHeader("Retry-After") ?? numberHeader("X-Ratelimit-Retry") });
      if (!response.ok) { rateLimited = response.status === 429; throw Error(`Publication HTTP ${response.status}`); }
      const observedAt = new Date(deps.now()).toISOString();
      const rows = publicationSnapshotRows(response.status === 204 ? [] : await response.json(), record, from, to, observedAt);
      if (!await deps.store.renewLease(account.id, owner)) throw Error("Publication lease lost before persistence");
      await deps.saveReports(rows);
      count = rows.length; outcome = "success"; detail = `publication_refreshed:${count}`;
    } catch (error) {
      outcome = "retryable_failure";
      detail = error instanceof Error ? error.message : "Publication refresh failed";
    } finally {
      if (leased) {
        try { if (!await deps.store.commitLease(leased, owner, true)) { outcome = "retryable_failure"; detail = "publication_lease_lost"; } }
        catch { outcome = "retryable_failure"; detail = "publication_lease_release_failed"; }
      }
      const result: WorkerAccountTaskResult = { task: "finance-publication", marketplaceAccountId: account.id,
        accountName: account.accountName, outcome, detail, durationMs: deps.now() - started, rateLimited,
        entities: [{ entity: "finance_publication", status: outcome, rowsPersisted: count }] };
      results.push(result);
      input.logger.log(outcome === "retryable_failure" ? "error" : "info", "task.publication", { ...result });
    }
  }
  return results;
}
