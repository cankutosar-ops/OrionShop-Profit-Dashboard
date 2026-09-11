/**
 * Assemble Unified Business Excel model from ReportContext + existing report builders.
 * Any selected date range — presentation only; never recalculates Financial Engine math.
 */

import {
  loadReportContext,
  type LoadReportContextOptions,
} from "@/lib/reporting/report-context";
import {
  CALCULATION_MODEL,
  FINANCIAL_ENGINE_VERSION,
} from "@/lib/reporting/section-utils";
import { buildPnLFromModelB } from "@/lib/reporting/module/pnl-report";
import { buildSettlementReport } from "@/lib/reporting/module/settlement-report";
import { buildProductProfitReport } from "@/lib/reporting/module/product-profit-report";
import { buildGroupPerformanceReport } from "@/lib/reporting/module/group-performance-report";
import { WEEKLY_FE_GLOSSARY } from "@/lib/reporting/weekly-business/glossary";
import {
  buildPeriodChunks,
  formatUnifiedReportTitle,
} from "@/lib/reporting/weekly-business/period-chunks";
import type {
  BrandOperBreakdownRow,
  BrandPeriodBreakdownRow,
  PeriodBreakdownRow,
  ReconciliationComponent,
  WeeklyBusinessWorkbookModel,
  WeeklyCashFlow,
  WeeklyDataQuality,
  WeeklyFinanceDetailRow,
  WeeklyReconciliation,
  WeeklySalesDetailRow,
} from "@/lib/reporting/weekly-business/types";
import {
  fetchFinanceInRange,
  fetchLatestFinanceOperationDate,
  fetchOrdersInRange,
  fetchSalesInRange,
} from "@/services/persisted-query-service";
import type {
  ModelBProfitMetrics,
  ProductProfitability,
  ScopedDateRange,
} from "@/types/database";

const FINANCE_INCOMPLETE_WARNING =
  "FINANCE DATA INCOMPLETE — Revenue, Settlement and Net Profit may be incomplete for this period.";

const FINANCE_NO_DATA_MESSAGE =
  "No Finance data available for selected period.";

const AFFECTED_FINANCE_METRICS =
  "Revenue, Settlement / Seller Payout, Net Profit, Finance Detail, Cash Flow (settlement basis)";

function maxIsoDate(values: Array<string | null | undefined>): string | null {
  let max: string | null = null;
  for (const v of values) {
    if (!v) continue;
    const d = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!max || d > max) max = d;
  }
  return max;
}

function calendarGapDays(fromInclusive: string, toInclusive: string): number {
  const a = Date.parse(`${fromInclusive}T00:00:00Z`);
  const b = Date.parse(`${toInclusive}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000);
}

function buildDataQuality(input: {
  scope: ScopedDateRange;
  syncFinanceLatest: string | null;
  dbFinanceLatest: string | null;
  financeLatestInPeriod: string | null;
  financeRowsInPeriod: number;
  syncFinanceGapDays: number | null;
  financeRecoveryNeeded: boolean;
  lastSyncStatus: string | null;
  ordersLatestDate: string | null;
  salesLatestDate: string | null;
  isSampleData: boolean;
  warnings: string[];
}): WeeklyDataQuality {
  let financeLatest: string | null = null;
  let financeLatestSource: WeeklyDataQuality["financeLatestSource"] = "none";

  if (input.syncFinanceLatest) {
    financeLatest = input.syncFinanceLatest;
    financeLatestSource = "marketplace_accounts.finance_latest_operation_date";
  }
  if (
    input.dbFinanceLatest &&
    (!financeLatest || input.dbFinanceLatest > financeLatest)
  ) {
    financeLatest = input.dbFinanceLatest;
    financeLatestSource = "wb_finance.max(operation_date)";
  }
  if (
    input.financeLatestInPeriod &&
    (!financeLatest || input.financeLatestInPeriod > financeLatest)
  ) {
    financeLatest = input.financeLatestInPeriod;
    financeLatestSource = "wb_finance.in_period";
  }

  const financeComplete =
    financeLatest != null && financeLatest >= input.scope.to;

  const financeGapDays = financeComplete
    ? null
    : financeLatest
      ? calendarGapDays(financeLatest, input.scope.to)
      : input.syncFinanceGapDays;

  const financeNoDataMessage =
    input.financeRowsInPeriod === 0 ? FINANCE_NO_DATA_MESSAGE : null;

  let financeIncompleteWarning: string | null = null;
  if (!financeComplete) {
    if (financeLatest) {
      financeIncompleteWarning =
        `${FINANCE_INCOMPLETE_WARNING} ` +
        `latest Finance operation_date=${financeLatest}; ` +
        `selected period end=${input.scope.to}; ` +
        `gap days=${financeGapDays ?? "—"}. ` +
        `Affected: ${AFFECTED_FINANCE_METRICS}.`;
    } else if (input.financeRowsInPeriod === 0) {
      financeIncompleteWarning =
        `${FINANCE_INCOMPLETE_WARNING} ` +
        `No account Finance latest operation_date detected. ` +
        `Affected: ${AFFECTED_FINANCE_METRICS}.`;
    } else {
      financeIncompleteWarning = FINANCE_INCOMPLETE_WARNING;
    }
  }

  return {
    financeLatestOperationDate: financeLatest,
    financeGapDays,
    financeRecoveryNeeded: input.financeRecoveryNeeded,
    financeComplete,
    financeIncompleteWarning,
    financeNoDataMessage,
    financeRowsInPeriod: input.financeRowsInPeriod,
    financeLatestInPeriod: input.financeLatestInPeriod,
    financeLatestSource,
    scopeTo: input.scope.to,
    affectedFinanceMetrics: AFFECTED_FINANCE_METRICS,
    lastSyncStatus: input.lastSyncStatus,
    ordersLatestDate: input.ordersLatestDate,
    salesLatestDate: input.salesLatestDate,
    financeLatestDate: financeLatest,
    isSampleData: input.isSampleData,
    warnings: input.warnings,
  };
}

function brandByProductId(
  products: Array<{ productId: string; brandName: string; productName: string }>
): Map<string, { brand: string; name: string }> {
  const map = new Map<string, { brand: string; name: string }>();
  for (const p of products) {
    map.set(String(p.productId), {
      brand: p.brandName?.trim() || "—",
      name: p.productName?.trim() || "—",
    });
  }
  return map;
}

function buildBrandOperBreakdown(
  financeDetail: WeeklyFinanceDetailRow[]
): BrandOperBreakdownRow[] {
  const acc = new Map<string, BrandOperBreakdownRow>();
  for (const row of financeDetail) {
    const oper = row.supplierOperName?.trim();
    if (!oper) continue;
    const brand = row.brand || "—";
    const key = `${brand}||${oper}`;
    const existing = acc.get(key);
    if (existing) {
      existing.amount += row.amount;
      existing.lineCount += 1;
    } else {
      acc.set(key, {
        brand,
        supplierOperName: oper,
        amount: row.amount,
        lineCount: 1,
      });
    }
  }
  return [...acc.values()].sort((a, b) => {
    const bc = a.brand.localeCompare(b.brand);
    if (bc !== 0) return bc;
    return a.supplierOperName.localeCompare(b.supplierOperName);
  });
}

function sliceScope(
  parent: ScopedDateRange,
  from: string,
  to: string
): ScopedDateRange {
  return {
    ...parent,
    from,
    to,
  };
}

async function buildPeriodBreakdowns(
  parentScope: ScopedDateRange,
  options: LoadReportContextOptions
): Promise<{
  kind: "none" | "month" | "week";
  periodBreakdown: PeriodBreakdownRow[];
  brandPeriodBreakdown: BrandPeriodBreakdownRow[];
}> {
  const chunks = buildPeriodChunks(parentScope);
  if (chunks.length === 0) {
    return { kind: "none", periodBreakdown: [], brandPeriodBreakdown: [] };
  }

  const kind = chunks[0].kind === "week" ? "week" : "month";
  const periodBreakdown: PeriodBreakdownRow[] = [];
  const brandPeriodBreakdown: BrandPeriodBreakdownRow[] = [];

  for (const chunk of chunks) {
    const subScope = sliceScope(parentScope, chunk.from, chunk.to);
    const sub = await loadReportContext(subScope, {
      skipInventory: true,
      ...options,
    });
    const fe = sub.financialEngine;
    const op = sub.overview.ordersPurchases;
    const qty = sub.overview.quantityMetrics;

    periodBreakdown.push({
      chunk,
      netSales: fe.netSales,
      marketplaceFee: fe.marketplaceFee ?? fe.commission,
      revenue: fe.revenue,
      logistics: fe.logistics,
      storage: fe.storage,
      acceptance: fe.acceptance,
      penalties: fe.penalties,
      adjustments: fe.adjustments,
      productCost: fe.productCost,
      advertising: fe.advertising,
      estimatedTax: fe.estimatedTax,
      finalNetProfit: fe.finalNetProfit,
      sellerPayout: fe.sellerPayout,
      ordersCount: op.ordersCount,
      unitsSold: qty.unitsSold,
      unitsReturned: qty.unitsReturned,
      netUnits: qty.netUnits,
      cashReceived: sub.overview.cashReceived?.amount ?? null,
      expectedWbPayout: sub.overview.expectedWbPayout?.amount ?? null,
    });

    const brandView = buildGroupPerformanceReport({
      products: sub.products,
      dimension: "brand",
      currency: sub.tenant.currency,
    });
    for (const row of brandView.rows) {
      brandPeriodBreakdown.push({
        periodLabel: chunk.label,
        from: chunk.from,
        to: chunk.to,
        brand: row.name,
        netSales: row.netSales,
        finalNetProfit: row.netProfit,
        unitsSold: row.unitsSold,
      });
    }
  }

  return { kind, periodBreakdown, brandPeriodBreakdown };
}

function component(
  label: string,
  accountAmount: number,
  allocatedAmount: number,
  /** +1 for revenue-like (increases NP); -1 for cost-like (decreases NP). */
  netProfitSign: 1 | -1,
  source: string
): ReconciliationComponent {
  const unallocatedAmount = accountAmount - allocatedAmount;
  return {
    label,
    accountAmount,
    allocatedAmount,
    unallocatedAmount,
    netProfitEffect: netProfitSign * unallocatedAmount,
    source,
  };
}

/** Presentation-only account vs product Net Profit bridge (does not recalculate FE). */
export function buildReconciliation(
  fe: ModelBProfitMetrics,
  products: ProductProfitability[],
  sumBrandFinalNetProfit: number
): WeeklyReconciliation {
  const sumProductFinalNetProfit = products.reduce(
    (s, p) => s + (Number(p.finalNetProfit) || 0),
    0
  );
  const sumRevenue = products.reduce((s, p) => s + (Number(p.revenue) || 0), 0);
  const sumProductCost = products.reduce(
    (s, p) => s + (Number(p.productCost) || 0),
    0
  );
  const sumLogistics = products.reduce(
    (s, p) => s + (Number(p.logistics) || 0) + (Number(p.returnLogistics) || 0),
    0
  );
  const sumStorage = products.reduce((s, p) => s + (Number(p.storage) || 0), 0);
  const sumPenalties = products.reduce(
    (s, p) => s + (Number(p.penalties) || 0),
    0
  );
  // Model B product finalNetProfit uses accountAdjustments as the adjustments input —
  // not otherExpenses (display/rollup only). Reconciling against otherExpenses creates a false residual.
  const sumAccountAdjustments = products.reduce(
    (s, p) => s + (Number(p.accountAdjustments) || 0),
    0
  );
  const sumAdvertising = products.reduce(
    (s, p) => s + (Number(p.advertising) || 0),
    0
  );
  // Product rows expose operating netProfit and finalNetProfit; tax ≈ operating − final.
  const sumEstimatedTax = products.reduce((s, p) => {
    const operating = Number(p.netProfit) || 0;
    const final = Number(p.finalNetProfit) || 0;
    return s + (operating - final);
  }, 0);

  const components: ReconciliationComponent[] = [
    component(
      "Revenue",
      fe.revenue,
      sumRevenue,
      1,
      "financialEngine.revenue − Σ product.revenue (Finance ppvz_for_pay)"
    ),
    component(
      "Unallocated Account-Level Cost — Product Cost",
      fe.productCost,
      sumProductCost,
      -1,
      "financialEngine.productCost − Σ product.productCost"
    ),
    component(
      "Unallocated Account-Level Cost — Logistics",
      fe.logistics,
      sumLogistics,
      -1,
      "financialEngine.logistics − Σ (product.logistics + product.returnLogistics)"
    ),
    component(
      "Unallocated Account-Level Cost — Storage",
      fe.storage,
      sumStorage,
      -1,
      "financialEngine.storage − Σ product.storage"
    ),
    component(
      "Unallocated Account-Level Cost — Acceptance",
      fe.acceptance,
      0,
      -1,
      "financialEngine.acceptance (not exposed as a product-row field; treated as unallocated)"
    ),
    component(
      "Unallocated Account-Level Cost — Penalties",
      fe.penalties,
      sumPenalties,
      -1,
      "financialEngine.penalties − Σ product.penalties"
    ),
    component(
      "Unallocated Account-Level Cost — Other",
      fe.adjustments,
      sumAccountAdjustments,
      -1,
      "financialEngine.adjustments − Σ product.accountAdjustments (Model B NP input; not otherExpenses)"
    ),
    component(
      "Unallocated Account-Level Cost — Advertising",
      fe.advertising,
      sumAdvertising,
      -1,
      "financialEngine.advertising − Σ product.advertising"
    ),
    component(
      "Unallocated Account-Level Cost — Estimated Tax",
      fe.estimatedTax,
      sumEstimatedTax,
      -1,
      "financialEngine.estimatedTax − Σ (product.netProfit − product.finalNetProfit)"
    ),
  ];

  const explainedUnallocatedNetProfit = components.reduce(
    (s, c) => s + c.netProfitEffect,
    0
  );
  const accountFinalNetProfit = fe.finalNetProfit;
  const difference = accountFinalNetProfit - sumProductFinalNetProfit;
  const residualDifference = difference - explainedUnallocatedNetProfit;

  return {
    accountFinalNetProfit,
    sumProductFinalNetProfit,
    sumBrandFinalNetProfit,
    difference,
    explainedUnallocatedNetProfit,
    residualDifference,
    components,
    identityStatement:
      "Account-level Net Profit = Allocated Product/Brand Profit + Unallocated Account-level Profit/Costs + Residual",
    brandAttributionNote:
      "Brand Performance Net Profit is product-attributed profitability (Σ Product Profit v2 finalNetProfit by brand). It does not include account-level costs that were never attributed to a product.",
    explanation:
      "Account-level finalNetProfit is Financial Engine Model B on the account scope. Product/Brand sums use product-level finalNetProfit only. Component unallocated lines are account − Σ product for the same FE fields — formulas are unchanged; this sheet only explains the gap.",
  };
}

function buildCashFlow(
  fe: ModelBProfitMetrics,
  overview: {
    cashReceived?: { amount: number | null; unavailableReason?: string };
    expectedWbPayout?: { amount: number | null; unavailableReason?: string };
  }
): WeeklyCashFlow {
  const cash = overview.cashReceived;
  const expected = overview.expectedWbPayout;
  const actualCashReceived =
    cash?.amount == null || !Number.isFinite(cash.amount) ? null : cash.amount;

  const netCashMovement =
    actualCashReceived == null
      ? null
      : actualCashReceived -
        fe.productCost -
        fe.advertising -
        fe.estimatedTax;

  return {
    actualCashReceived,
    actualCashReceivedUnavailableReason:
      actualCashReceived == null
        ? cash?.unavailableReason?.trim() ||
          "Actual Cash Received is not available for the selected period (no bankPaymentSum with payment date in range)."
        : null,
    actualCashReceivedSource:
      "overview.cashReceived ← WB sales reports bankPaymentSum by payment date (createDate)",
    expectedWbPayout:
      expected?.amount == null || !Number.isFinite(expected.amount)
        ? null
        : expected.amount,
    expectedWbPayoutUnavailableReason:
      expected?.amount == null
        ? expected?.unavailableReason?.trim() ||
          "Expected WB Payout unavailable for selected period."
        : null,
    expectedWbPayoutSource:
      "overview.expectedWbPayout ← WB realization reports overlapping selected period",
    sellerPayoutSettlement: fe.sellerPayout,
    sellerPayoutSource: "financialEngine.sellerPayout",
    sellerPayoutMeaning:
      "WB Seller Payout / Settlement = Revenue − Logistics − Storage − Acceptance − Penalties − Other. This is settlement entitlement from Finance — not fabricated bank cash.",
    productCost: fe.productCost,
    logistics: fe.logistics,
    storage: fe.storage,
    acceptance: fe.acceptance,
    penalties: fe.penalties,
    otherCosts: fe.adjustments,
    advertising: fe.advertising,
    estimatedTax: fe.estimatedTax,
    netCashMovement,
    netCashMovementBasis:
      actualCashReceived == null
        ? "Unavailable — Actual Cash Received missing. Do not treat Seller Payout as bank cash. Settlement-basis Net Profit (FE finalNetProfit) shown for reference."
        : "Actual Cash Received − Product Cost − Advertising − Estimated Tax (logistics/storage/acceptance/penalties/other already deducted inside Seller Payout / settlement, not double-counted here)",
    settlementBasisNetProfit: fe.finalNetProfit,
  };
}

export async function buildWeeklyBusinessWorkbookModel(
  scope: ScopedDateRange,
  options: LoadReportContextOptions = {}
): Promise<WeeklyBusinessWorkbookModel> {
  const ctx = await loadReportContext(scope, {
    skipInventory: true,
    ...options,
  });

  const currency = ctx.tenant.currency;
  const fe = ctx.financialEngine;

  const pnl = buildPnLFromModelB(fe, currency);
  const settlement = buildSettlementReport({
    fe,
    overview: ctx.overview,
    products: ctx.products,
    currency,
  });
  const productProfit = buildProductProfitReport({
    products: ctx.products,
    currency,
  });
  const brandPerformance = buildGroupPerformanceReport({
    products: ctx.products,
    dimension: "brand",
    currency,
  });
  const categoryPerformance = buildGroupPerformanceReport({
    products: ctx.products,
    dimension: "category",
    currency,
  });

  const brandMap = brandByProductId(ctx.products);

  // Full-account finance for the selected period (no product_id filter).
  // Filtering by productIds previously dropped orphan / unmatched product links
  // and could empty Finance Detail while P&L still had Finance-derived Revenue.
  const [financeRows, salesRows, orderRows, periodSlices, dbFinanceLatest] =
    await Promise.all([
      fetchFinanceInRange(scope, undefined, {
        columns:
          "operation_date,nm_id,product_id,srid,supplier_oper_name,operation_type,finance_category,amount,source_key,realizationreport_id",
      }).catch(() => []),
      fetchSalesInRange(scope, undefined, {
        columns:
          "sale_date,srid,nm_id,product_id,quantity,price_with_disc,for_pay,is_return,warehouse,revenue",
      }).catch(() => []),
      fetchOrdersInRange(scope, undefined, {
        columns: "order_date",
      }).catch(() => []),
      buildPeriodBreakdowns(scope, options),
      fetchLatestFinanceOperationDate(scope.marketplaceAccountId).catch(
        () => null
      ),
    ]);

  const financeDetail: WeeklyFinanceDetailRow[] = financeRows.map((row) => {
    const brand =
      (row.product_id ? brandMap.get(String(row.product_id))?.brand : undefined) ??
      "—";
    return {
      operationDate: String(row.operation_date).slice(0, 10),
      nmId: row.nm_id ?? null,
      brand,
      srid: row.srid ?? null,
      supplierOperName: row.supplier_oper_name ?? null,
      operationType: String(row.operation_type ?? ""),
      financeCategory: row.finance_category ?? null,
      amount: Number(row.amount) || 0,
      sourceKey: row.source_key ?? null,
      realizationReportId: row.realizationreport_id ?? null,
    };
  });

  const salesDetail: WeeklySalesDetailRow[] = salesRows.map((row) => {
    const meta = row.product_id ? brandMap.get(String(row.product_id)) : undefined;
    return {
      saleDate: String(row.sale_date).slice(0, 10),
      srid: row.srid,
      nmId: row.nm_id,
      productName: meta?.name ?? "—",
      brand: meta?.brand ?? "—",
      quantity: Number(row.quantity) || 0,
      priceWithDisc:
        row.price_with_disc == null ? null : Number(row.price_with_disc),
      forPay: row.for_pay == null ? null : Number(row.for_pay),
      isReturn: Boolean(row.is_return),
      warehouse: row.warehouse ?? null,
    };
  });

  const ordersLatestDate = maxIsoDate(orderRows.map((r) => r.order_date));
  const salesLatestDate = maxIsoDate(salesDetail.map((r) => r.saleDate));
  const financeLatestInPeriod = maxIsoDate(
    financeDetail.map((r) => r.operationDate)
  );

  const dataQuality = buildDataQuality({
    scope,
    syncFinanceLatest: ctx.sync.financeLatestOperationDate,
    dbFinanceLatest,
    financeLatestInPeriod,
    financeRowsInPeriod: financeDetail.length,
    syncFinanceGapDays: ctx.sync.financeGapDays,
    financeRecoveryNeeded: ctx.sync.financeRecoveryNeeded,
    lastSyncStatus: ctx.sync.lastSyncStatus,
    ordersLatestDate,
    salesLatestDate,
    isSampleData: ctx.meta.isSampleData,
    warnings: ctx.meta.warnings,
  });

  const reconciliation = buildReconciliation(
    fe,
    ctx.products,
    brandPerformance.totals.netProfit
  );
  const cashFlow = buildCashFlow(fe, ctx.overview);

  const hasCommercialActivity =
    fe.netSales !== 0 ||
    fe.revenue !== 0 ||
    fe.advertising !== 0 ||
    productProfit.rows.length > 0 ||
    financeDetail.length > 0 ||
    salesDetail.length > 0;

  return {
    generatedAt: ctx.generatedAt,
    financialEngineVersion: FINANCIAL_ENGINE_VERSION,
    calculationModel: CALCULATION_MODEL,
    reportTitle: formatUnifiedReportTitle(scope.from, scope.to),
    periodPresetLabel: ctx.periodPresetLabel,
    periodBreakdownKind: periodSlices.kind,
    periodBreakdown: periodSlices.periodBreakdown,
    brandPeriodBreakdown: periodSlices.brandPeriodBreakdown,
    ctx,
    dataQuality,
    hasCommercialActivity,
    pnl,
    settlement,
    productProfit,
    brandPerformance,
    categoryPerformance,
    brandOperBreakdown: buildBrandOperBreakdown(financeDetail),
    reconciliation,
    cashFlow,
    glossary: WEEKLY_FE_GLOSSARY,
    financeDetail,
    salesDetail,
  };
}

export { FINANCE_INCOMPLETE_WARNING, FINANCE_NO_DATA_MESSAGE };
