import type {
  DateRange,
  FinanceOperationType,
  ProductCostHistory,
  ProfitBreakdown,
  WbAd,
  WbFinance,
  WbSale,
} from "@/types/database";
import { FINANCE_OPERATION_TYPES } from "@/types/database";

/** Temporary audit window — remove after profitability investigation. */
const AUDIT_RANGE: DateRange = { from: "2026-05-24", to: "2026-06-23" };

const COST_COLORS = {
  productCost: "#ef4444",
  commission: "#f59e0b",
  logistics: "#6366f1",
  returnLogistics: "#8b5cf6",
  storage: "#06b6d4",
  advertising: "#ec4899",
  penalties: "#dc2626",
  otherExpenses: "#71717a",
} as const;

/**
 * Net profit formula used by the dashboard:
 *
 *   Revenue (wb_sales.revenue, non-returns)
 * - Product Cost (product_cost_history, latest per supplier_article)
 * - Commission (wb_finance.operation_type = 'commission')
 * - Logistics (wb_finance.operation_type = 'logistics')
 * - Return Logistics (wb_finance.operation_type = 'return_logistics')
 * - Storage (wb_finance.operation_type = 'storage')
 * - Penalties (wb_finance.operation_type = 'penalty')
 * - Other Expenses (wb_finance.operation_type = 'other' + any unclassified types)
 * - Advertising (wb_ads.spend — separate from wb_finance)
 */
export const PROFIT_FORMULA_DESCRIPTION = [
  "Revenue (wb_sales, non-returns)",
  "- Product Cost (product_cost_history)",
  "- Commission (wb_finance: commission)",
  "- Logistics (wb_finance: logistics)",
  "- Return Logistics (wb_finance: return_logistics)",
  "- Storage (wb_finance: storage)",
  "- Penalties (wb_finance: penalty)",
  "- Other Expenses (wb_finance: other + unclassified)",
  "- Advertising (wb_ads.spend)",
].join("\n");

export type FinanceExpenseTotals = Record<FinanceOperationType, number> & {
  unclassified: number;
  total: number;
};

function financeDate(value: string): string {
  return value.slice(0, 10);
}

function isAuditRange(range?: DateRange): boolean {
  if (!range) return process.env.PROFIT_AUDIT === "1";
  return range.from === AUDIT_RANGE.from && range.to === AUDIT_RANGE.to;
}

function logProfitBreakdownAudit(
  breakdown: ProfitBreakdown,
  finance: WbFinance[],
  financeTotals: FinanceExpenseTotals,
  context: {
    salesCount: number;
    financeRows: number;
    financeRowsExpected?: number;
    adsRows: number;
    range?: DateRange;
  }
) {
  if (!isAuditRange(context.range)) return;

  if (context.financeRows === 1000) {
    console.log("  ⚠ WARNING: exactly 1000 finance rows — may be Supabase default limit truncation");
  }

  const typeCounts: Record<string, number> = {};
  const typeAmounts: Record<string, number> = {};
  for (const row of finance) {
    const type = row.operation_type;
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    typeAmounts[type] = (typeAmounts[type] ?? 0) + Math.abs(Number(row.amount));
  }

  const excludedFromOtherLine = financeTotals.penalty;
  const includedInOtherLine = financeTotals.other + financeTotals.unclassified;

  console.log("\n[PROFIT_AUDIT] buildProfitBreakdown");
  console.log(`  Date range: ${context.range?.from ?? AUDIT_RANGE.from} → ${context.range?.to ?? AUDIT_RANGE.to}`);
  console.log(`  Input rows: ${context.salesCount} sales, ${context.financeRows} finance, ${context.adsRows} ads`);
  console.log("  ---");
  console.log(`  Revenue:            ${breakdown.revenue.toFixed(2)}  ← SUM(wb_sales.revenue) WHERE is_return = false`);
  console.log(`  Commission:         ${breakdown.commission.toFixed(2)}  ← SUM(wb_finance.amount) WHERE operation_type = 'commission'`);
  console.log(`  Logistics:          ${breakdown.logistics.toFixed(2)}  ← SUM(wb_finance.amount) WHERE operation_type = 'logistics'`);
  console.log(`  Return Logistics:   ${breakdown.returnLogistics.toFixed(2)}  ← SUM(wb_finance.amount) WHERE operation_type = 'return_logistics'`);
  console.log(`  Storage:            ${breakdown.storage.toFixed(2)}  ← SUM(wb_finance.amount) WHERE operation_type = 'storage'`);
  console.log(`  Penalties:          ${breakdown.penalties.toFixed(2)}  ← SUM(wb_finance.amount) WHERE operation_type = 'penalty' (separate line, NOT in Other)`);
  console.log(`  Other:              ${breakdown.otherExpenses.toFixed(2)}  ← operation_type 'other' (${financeTotals.other.toFixed(2)}) + unclassified (${financeTotals.unclassified.toFixed(2)})`);
  console.log(`  Advertising:        ${breakdown.advertising.toFixed(2)}  ← SUM(wb_ads.spend)`);
  console.log(`  Product Cost:       ${breakdown.productCost.toFixed(2)}  ← SUM(latest_cost × quantity) per sale`);
  console.log("  ---");
  console.log(`  Net Profit:         ${breakdown.netProfit.toFixed(2)}`);
  console.log("  Finance operation_type amounts in range:", typeAmounts);
  console.log("  Finance operation_type row counts:", typeCounts);
  if (financeTotals.unclassified > 0) {
    const unknown = Object.keys(typeAmounts).filter(
      (t) => !FINANCE_OPERATION_TYPES.includes(t as FinanceOperationType)
    );
    console.log("  Unclassified types rolled into Other:", unknown);
  }
  console.log(
    `  Note: 'penalty' (${excludedFromOtherLine.toFixed(2)}) is deducted separately from 'Other' (${includedInOtherLine.toFixed(2)})`
  );
  console.log("[PROFIT_AUDIT] end\n");
}

export function calculateNetProfit(components: {
  revenue: number;
  productCost: number;
  commission: number;
  logistics: number;
  returnLogistics: number;
  storage: number;
  advertising: number;
  penalties: number;
  otherExpenses: number;
}): number {
  return (
    components.revenue -
    components.productCost -
    components.commission -
    components.logistics -
    components.returnLogistics -
    components.storage -
    components.advertising -
    components.penalties -
    components.otherExpenses
  );
}

export function calculateReturnRate(unitsSold: number, unitsReturned: number): number {
  const total = unitsSold + unitsReturned;
  if (total === 0) return 0;
  return (unitsReturned / total) * 100;
}

export function sumFinanceByType(
  financeRecords: WbFinance[],
  type: FinanceOperationType
): number {
  return financeRecords
    .filter((r) => r.operation_type === type)
    .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
}

/** Sum all wb_finance rows by operation_type; unclassified types roll into `other`. */
export function sumFinanceExpenses(financeRecords: WbFinance[]): FinanceExpenseTotals {
  const byType = FINANCE_OPERATION_TYPES.reduce(
    (acc, type) => {
      acc[type] = sumFinanceByType(financeRecords, type);
      return acc;
    },
    {} as Record<FinanceOperationType, number>
  );

  const unclassified = financeRecords
    .filter((record) => !FINANCE_OPERATION_TYPES.includes(record.operation_type))
    .reduce((sum, record) => sum + Math.abs(Number(record.amount)), 0);

  const total =
    FINANCE_OPERATION_TYPES.reduce((sum, type) => sum + byType[type], 0) + unclassified;

  return { ...byType, unclassified, total };
}

export function formatProfitAudit(breakdown: ProfitBreakdown, financeRows: number): string {
  const totalDeductions =
    breakdown.productCost +
    breakdown.commission +
    breakdown.logistics +
    breakdown.returnLogistics +
    breakdown.storage +
    breakdown.penalties +
    breakdown.otherExpenses +
    breakdown.advertising;

  const lines = [
    "Net profit calculation",
    "========================",
    `Revenue:              ${breakdown.revenue.toFixed(2)}`,
    `- Product Cost:       ${breakdown.productCost.toFixed(2)}`,
    `- Commission:         ${breakdown.commission.toFixed(2)}`,
    `- Logistics:          ${breakdown.logistics.toFixed(2)}`,
    `- Return Logistics:   ${breakdown.returnLogistics.toFixed(2)}`,
    `- Storage:            ${breakdown.storage.toFixed(2)}`,
    `- Penalties:          ${breakdown.penalties.toFixed(2)}`,
    `- Other Expenses:     ${breakdown.otherExpenses.toFixed(2)}`,
    `- Advertising:        ${breakdown.advertising.toFixed(2)}`,
    "----------------------------------------",
    `= Net Profit:         ${breakdown.netProfit.toFixed(2)}`,
    "",
    `Total deductions:     ${totalDeductions.toFixed(2)}`,
    `Finance rows in range: ${financeRows}`,
    `Check: Revenue - deductions = ${(breakdown.revenue - totalDeductions).toFixed(2)}`,
  ];

  return lines.join("\n");
}

export function getProductCostAtDate(
  costHistory: ProductCostHistory[],
  date: string
): number {
  const applicable = costHistory
    .filter((c) => c.effective_from <= date && (!c.effective_to || c.effective_to >= date))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  return applicable[0]?.cost ?? 0;
}

/** Latest cost per supplier_article, mapped to each product_id. */
export function buildLatestCostByProductId(
  costHistory: ProductCostHistory[],
  products: { id: string; supplier_article: string }[]
): Map<string, number> {
  const latestByArticle = new Map<string, ProductCostHistory>();

  for (const entry of costHistory) {
    const product = products.find((p) => String(p.id) === String(entry.product_id));
    if (!product) continue;

    const current = latestByArticle.get(product.supplier_article);
    if (!current || entry.effective_from.localeCompare(current.effective_from) > 0) {
      latestByArticle.set(product.supplier_article, entry);
    }
  }

  const byProductId = new Map<string, number>();
  for (const product of products) {
    const latest = latestByArticle.get(product.supplier_article);
    if (latest) {
      byProductId.set(String(product.id), latest.cost);
    }
  }

  return byProductId;
}

function resolveUnitCost(
  sale: WbSale,
  costHistory: ProductCostHistory[],
  latestCostByProductId?: Map<string, number>
): number {
  const latest = latestCostByProductId?.get(String(sale.product_id));
  if (latest !== undefined) return latest;
  return getProductCostAtDate(costHistory, sale.sale_date);
}

export function buildProfitBreakdown(params: {
  sales: WbSale[];
  finance: WbFinance[];
  ads: WbAd[];
  costHistory: ProductCostHistory[];
  latestCostByProductId?: Map<string, number>;
  auditRange?: DateRange;
}): ProfitBreakdown {
  const { sales, finance, ads, costHistory, latestCostByProductId, auditRange } = params;

  const completedSales = sales.filter((s) => !s.is_return);
  const returns = sales.filter((s) => s.is_return);

  const revenue = completedSales.reduce((sum, s) => sum + s.revenue, 0);
  const unitsSold = completedSales.reduce((sum, s) => sum + s.quantity, 0);
  const unitsReturned = returns.reduce((sum, s) => sum + s.quantity, 0);

  const productCost = completedSales.reduce((sum, sale) => {
    const unitCost = resolveUnitCost(sale, costHistory, latestCostByProductId);
    return sum + unitCost * sale.quantity;
  }, 0);

  const financeTotals = sumFinanceExpenses(finance);
  const commission = financeTotals.commission;
  const logistics = financeTotals.logistics;
  const returnLogistics = financeTotals.return_logistics;
  const storage = financeTotals.storage;
  const penalties = financeTotals.penalty;
  const otherExpenses = financeTotals.other + financeTotals.unclassified;
  const advertising = ads.reduce((sum, ad) => sum + ad.spend, 0);

  const netProfit = calculateNetProfit({
    revenue,
    productCost,
    commission,
    logistics,
    returnLogistics,
    storage,
    advertising,
    penalties,
    otherExpenses,
  });

  const breakdown: ProfitBreakdown = {
    revenue,
    productCost,
    commission,
    logistics,
    returnLogistics,
    storage,
    advertising,
    penalties,
    otherExpenses,
    netProfit,
    returnRate: calculateReturnRate(unitsSold, unitsReturned),
    unitsSold,
    unitsReturned,
  };

  logProfitBreakdownAudit(breakdown, finance, financeTotals, {
    salesCount: completedSales.length,
    financeRows: finance.length,
    financeRowsExpected: undefined,
    adsRows: ads.length,
    range: auditRange,
  });

  return breakdown;
}

export function buildCostBreakdown(breakdown: ProfitBreakdown) {
  const marketplaceFees = breakdown.commission + breakdown.otherExpenses;

  return [
    { name: "Product Cost", value: breakdown.productCost, color: COST_COLORS.productCost },
    {
      name: "Marketplace Fees",
      value: marketplaceFees,
      color: COST_COLORS.commission,
    },
    { name: "Logistics", value: breakdown.logistics, color: COST_COLORS.logistics },
    {
      name: "Return Logistics",
      value: breakdown.returnLogistics,
      color: COST_COLORS.returnLogistics,
    },
    { name: "Storage", value: breakdown.storage, color: COST_COLORS.storage },
    { name: "Advertising", value: breakdown.advertising, color: COST_COLORS.advertising },
    { name: "Penalties", value: breakdown.penalties, color: COST_COLORS.penalties },
  ].filter((item) => item.value > 0);
}

export function groupSalesByDate(
  sales: WbSale[],
  costHistory: ProductCostHistory[],
  finance: WbFinance[],
  latestCostByProductId?: Map<string, number>
): { date: string; revenue: number; profit: number }[] {
  const dateMap = new Map<string, { revenue: number; sales: WbSale[] }>();

  for (const sale of sales.filter((s) => !s.is_return)) {
    const date = financeDate(sale.sale_date);
    const existing = dateMap.get(date) ?? { revenue: 0, sales: [] };
    existing.revenue += sale.revenue;
    existing.sales.push(sale);
    dateMap.set(date, existing);
  }

  return Array.from(dateMap.entries())
    .map(([date, data]) => {
      const dayFinance = finance.filter((f) => financeDate(f.operation_date) === date);
      const dayBreakdown = buildProfitBreakdown({
        sales: data.sales,
        finance: dayFinance,
        ads: [],
        costHistory,
        latestCostByProductId,
      });
      return { date, revenue: data.revenue, profit: dayBreakdown.netProfit };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export { COST_COLORS };
