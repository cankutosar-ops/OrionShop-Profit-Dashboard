import type { AdminClient } from "@/lib/supabase/admin";
import type { WbApiFinanceRow } from "@/lib/wildberries/types";
import type {
  CompanyTaxProfile,
  WbFinanceTaxClassification,
  WbFinanceTransactionContext,
  WbFinanceTransactionEvidence,
} from "@/types/database";

export const FINANCE_TAX_EVIDENCE_SOURCE_VERSION = "WB_FINANCE_REPORTS_V1_2026_09";

type EvidenceInsert = Omit<WbFinanceTransactionEvidence, "id" | "created_at" | "updated_at">;

const finiteOrNull = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function dateOnly(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

function operationText(row: WbApiFinanceRow): string {
  return `${row.doc_type_name ?? ""} ${row.supplier_oper_name ?? ""}`.trim().toLowerCase();
}

export function classifyFinanceTransaction(row: WbApiFinanceRow): {
  operationContext: WbFinanceTransactionContext;
  taxClassification: WbFinanceTaxClassification;
} {
  const text = operationText(row);
  if (text.includes("возврат") || text.includes("return")) {
    return { operationContext: "RETURN", taxClassification: "TAXABLE_REFUND" };
  }
  if (text.includes("коррект") || text.includes("сторно") || text.includes("correction")) {
    return { operationContext: "CORRECTION", taxClassification: "REVIEW" };
  }
  if (text.includes("компенс") || text.includes("возмещ") || text.includes("compensation")) {
    return { operationContext: "COMPENSATION", taxClassification: "REVIEW" };
  }
  if (text.includes("продаж") || text.includes("sale")) {
    return { operationContext: "SALE", taxClassification: "TAXABLE_SALE" };
  }
  if (
    Math.abs(row.additional_payment ?? 0) > 0 ||
    Math.abs(row.cashback_amount ?? 0) > 0 ||
    Math.abs(row.cashback_discount ?? 0) > 0 ||
    Math.abs(row.cashback_commission_change ?? 0) > 0
  ) {
    return { operationContext: "COMPENSATION", taxClassification: "REVIEW" };
  }
  if (
    Math.abs(row.retail_amount ?? 0) === 0 &&
    Math.abs(row.additional_payment ?? 0) === 0 &&
    Math.abs(row.cashback_discount ?? 0) === 0
  ) {
    return { operationContext: "OTHER", taxClassification: "NON_TAXABLE_OPERATION" };
  }
  return { operationContext: "OTHER", taxClassification: "REVIEW" };
}

export function mapFinanceTransactionEvidence(
  row: WbApiFinanceRow,
  marketplaceAccountId: string,
  observedAt = new Date().toISOString()
): EvidenceInsert {
  if (!Number.isSafeInteger(row.rrd_id)) throw new Error("Finance evidence requires safe rrd_id");
  if (!Number.isSafeInteger(row.realizationreport_id)) {
    throw new Error(`Finance evidence rrd:${row.rrd_id} requires report identity`);
  }
  const classified = classifyFinanceTransaction(row);
  return {
    marketplace_account_id: marketplaceAccountId,
    report_id: Number(row.realizationreport_id),
    rrd_id: row.rrd_id,
    nm_id: finiteOrNull(row.nm_id),
    srid: row.srid?.trim() || null,
    sku: row.sku?.trim() || null,
    quantity: finiteOrNull(row.quantity),
    retail_price: finiteOrNull(row.retail_price),
    retail_amount: finiteOrNull(row.retail_amount),
    retail_price_with_discount: finiteOrNull(row.retail_price_withdisc_rub),
    for_pay: finiteOrNull(row.ppvz_for_pay),
    additional_payment: finiteOrNull(row.additional_payment),
    cashback_amount: finiteOrNull(row.cashback_amount),
    cashback_discount: finiteOrNull(row.cashback_discount),
    cashback_commission_change: finiteOrNull(row.cashback_commission_change),
    doc_type_name: row.doc_type_name?.trim() || null,
    seller_oper_name: row.supplier_oper_name?.trim() || null,
    sale_dt: row.sale_dt ?? null,
    rr_date: dateOnly(row.rr_dt),
    economic_event_date: dateOnly(row.sale_dt),
    finance_recognition_date: dateOnly(row.rr_dt),
    operation_context: classified.operationContext,
    tax_classification: classified.taxClassification,
    tax_effective_date: null,
    tax_effective_date_status: "UNVERIFIED",
    source_api_version: FINANCE_TAX_EVIDENCE_SOURCE_VERSION,
    observed_at: observedAt,
  };
}

export async function persistFinanceTransactionEvidence(input: {
  db: AdminClient;
  accountId: string;
  rows: EvidenceInsert[];
  leaseOwner?: string;
}): Promise<{ persisted: number; errors: string[] }> {
  if (input.rows.length === 0) return { persisted: 0, errors: [] };
  if (input.rows.some((row) => String(row.marketplace_account_id) !== String(input.accountId))) {
    return { persisted: 0, errors: ["Finance evidence account scope mismatch"] };
  }
  const { error } = await input.db.rpc(
    "orion_finance_transaction_evidence_upsert_batch" as never,
    {
      p_account_id: input.accountId,
      p_owner: input.leaseOwner ?? null,
      p_rows: input.rows,
    } as never
  );
  return error
    ? { persisted: 0, errors: [`Finance transaction evidence upsert failed: ${error.message}`] }
    : { persisted: input.rows.length, errors: [] };
}

export type FinanceReportControl = {
  marketplace_account_id: string | number;
  report_id: number;
  date_from: string;
  date_to: string;
  retail_amount_sum: number | null;
};

export type TaxableRevenueEvidenceResult = {
  regime: "USN_INCOME_MINUS_EXPENSES";
  amountKopeks: null;
  status: "PARTIAL" | "UNVERIFIED" | "UNAVAILABLE";
  source: typeof FINANCE_TAX_EVIDENCE_SOURCE_VERSION;
  from: string;
  to: string;
  saleAmountKopeks: number;
  refundAmountKopeks: number;
  taxableCompensationKopeks: null;
  vatAdjustmentKopeks: null;
  candidateBeforeVatKopeks: number;
  evidenceCoverage: { rowCount: number; reportCount: number; latestCompleteFinanceDate: string | null };
  unresolvedAmountKopeks: number;
  reasons: string[];
};

const kopeks = (rubles: number): number => Math.round(rubles * 100);

export function assessFinanceTaxableRevenueEvidence(input: {
  profile: CompanyTaxProfile | null;
  rows: WbFinanceTransactionEvidence[];
  controls: FinanceReportControl[];
  from: string;
  to: string;
  toleranceRub?: number;
}): TaxableRevenueEvidenceResult {
  const base: TaxableRevenueEvidenceResult = {
    regime: "USN_INCOME_MINUS_EXPENSES",
    amountKopeks: null,
    status: "UNAVAILABLE",
    source: FINANCE_TAX_EVIDENCE_SOURCE_VERSION,
    from: input.from,
    to: input.to,
    saleAmountKopeks: 0,
    refundAmountKopeks: 0,
    taxableCompensationKopeks: null,
    vatAdjustmentKopeks: null,
    candidateBeforeVatKopeks: 0,
    evidenceCoverage: {
      rowCount: input.rows.length,
      reportCount: input.controls.length,
      latestCompleteFinanceDate: null,
    },
    unresolvedAmountKopeks: 0,
    reasons: [],
  };
  if (!input.profile || input.profile.tax_object !== "USN_INCOME_MINUS_EXPENSES") {
    return { ...base, reasons: ["PROVIDER_NOT_ENABLED_FOR_TAX_REGIME"] };
  }
  if (input.rows.length === 0 || input.controls.length === 0) {
    return { ...base, reasons: ["FINANCE_TRANSACTION_EVIDENCE_UNAVAILABLE"] };
  }

  const reasons: string[] = [];
  let sales = 0;
  let refunds = 0;
  let unresolved = 0;
  for (const row of input.rows) {
    const value = Math.abs(Number(row.retail_amount ?? 0));
    if (row.tax_classification === "TAXABLE_SALE") sales += value;
    else if (row.tax_classification === "TAXABLE_REFUND") refunds += value;
    else if (row.tax_classification === "REVIEW") unresolved += value;
    unresolved += Math.abs(Number(row.additional_payment ?? 0)) +
      Math.abs(Number(row.cashback_amount ?? 0)) +
      Math.abs(Number(row.cashback_discount ?? 0)) +
      Math.abs(Number(row.cashback_commission_change ?? 0));
  }

  const reportKey = (accountId: string | number, reportId: string | number) =>
    `${String(accountId)}:${String(reportId)}`;
  const controlsByReport = new Map(input.controls.map((row) => [
    reportKey(row.marketplace_account_id, row.report_id), row,
  ]));
  const rowsByReport = new Map<string, number>();
  for (const row of input.rows) {
    const key = reportKey(row.marketplace_account_id, row.report_id);
    rowsByReport.set(
      key,
      (rowsByReport.get(key) ?? 0) + Number(row.retail_amount ?? 0)
    );
  }
  const tolerance = input.toleranceRub ?? 0.01;
  for (const [key, detailed] of rowsByReport) {
    const control = controlsByReport.get(key);
    if (control?.retail_amount_sum == null || Math.abs(detailed - Number(control.retail_amount_sum)) > tolerance) {
      reasons.push(`REPORT_RECONCILIATION_MISMATCH:${key}`);
    }
  }
  for (const [key, control] of controlsByReport) {
    if (!rowsByReport.has(key) && Math.abs(Number(control.retail_amount_sum ?? 0)) > tolerance) {
      reasons.push(`REPORT_RECONCILIATION_MISMATCH:${key}`);
    }
  }
  const latestComplete = input.controls.reduce<string | null>(
    (latest, row) => !latest || row.date_to > latest ? row.date_to : latest,
    null
  );
  if (!latestComplete || latestComplete < input.to) reasons.push("FINANCE_COVERAGE_INCOMPLETE");
  const accountIds = new Set(input.rows.map((row) => String(row.marketplace_account_id)));
  for (const accountId of accountIds) {
    const accountLatest = input.controls
      .filter((row) => String(row.marketplace_account_id) === accountId)
      .reduce<string | null>((latest, row) => !latest || row.date_to > latest ? row.date_to : latest, null);
    if (!accountLatest || accountLatest < input.to) reasons.push(`FINANCE_COVERAGE_INCOMPLETE:${accountId}`);
  }
  if (unresolved > 0) reasons.push("UNRESOLVED_FINANCE_OPERATIONS");
  if (input.rows.some((row) =>
    row.operation_context === "COMPENSATION" ||
    Math.abs(Number(row.additional_payment ?? 0)) > 0 ||
    Math.abs(Number(row.cashback_amount ?? 0)) > 0 ||
    Math.abs(Number(row.cashback_discount ?? 0)) > 0 ||
    Math.abs(Number(row.cashback_commission_change ?? 0)) > 0
  )) {
    reasons.push("COMPENSATION_TREATMENT_UNVERIFIED");
  }
  reasons.push("TAX_EFFECTIVE_DATE_POLICY_UNAPPROVED");
  if (input.profile.vat_status !== "EXEMPT") reasons.push("VAT_TREATMENT_UNVERIFIED");
  const uniqueReasons = [...new Set(reasons)];

  return {
    ...base,
    status: uniqueReasons.some((reason) =>
      reason.startsWith("REPORT_RECONCILIATION_MISMATCH") ||
      reason.startsWith("FINANCE_COVERAGE_INCOMPLETE")
    ) ? "PARTIAL" : "UNVERIFIED",
    saleAmountKopeks: kopeks(sales),
    refundAmountKopeks: kopeks(refunds),
    candidateBeforeVatKopeks: kopeks(sales - refunds),
    unresolvedAmountKopeks: kopeks(unresolved),
    evidenceCoverage: {
      rowCount: input.rows.length,
      reportCount: input.controls.length,
      latestCompleteFinanceDate: latestComplete,
    },
    reasons: uniqueReasons,
  };
}

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await page(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export async function loadCompanyFinanceTaxableRevenueEvidence(input: {
  db: AdminClient;
  profile: CompanyTaxProfile | null;
  accountIds: string[];
  from: string;
  to: string;
}): Promise<TaxableRevenueEvidenceResult> {
  if (!input.profile || input.profile.tax_object !== "USN_INCOME_MINUS_EXPENSES") {
    return assessFinanceTaxableRevenueEvidence({
      profile: input.profile, rows: [], controls: [], from: input.from, to: input.to,
    });
  }
  try {
    const rows: WbFinanceTransactionEvidence[] = [];
    const controls: FinanceReportControl[] = [];
    for (const accountId of input.accountIds) {
      rows.push(...await readAll<WbFinanceTransactionEvidence>((from, to) => input.db
        .from("wb_finance_transaction_evidence")
        .select("*")
        .eq("marketplace_account_id", accountId)
        .gte("rr_date", input.from)
        .lte("rr_date", input.to)
        .order("rrd_id")
        .range(from, to)));
      controls.push(...await readAll<FinanceReportControl>((from, to) => input.db
        .from("warehouse_sales_report_snapshot")
        .select("marketplace_account_id,report_id,date_from,date_to,retail_amount_sum")
        .eq("marketplace_account_id", Number(accountId))
        .lte("date_from", input.to)
        .gte("date_to", input.from)
        .order("report_id")
        .range(from, to)));
    }
    return assessFinanceTaxableRevenueEvidence({
      profile: input.profile, rows, controls, from: input.from, to: input.to,
    });
  } catch {
    const unavailable = assessFinanceTaxableRevenueEvidence({
      profile: input.profile, rows: [], controls: [], from: input.from, to: input.to,
    });
    return { ...unavailable, reasons: ["FINANCE_TRANSACTION_EVIDENCE_UNAVAILABLE"] };
  }
}
