/**
 * Unified Business Excel — model types (presentation layer only).
 * Works for any selected date range (week, month, multi-month, custom).
 */

import type { ReportContext } from "@/lib/reporting/report-context";
import type { PnLReportView } from "@/lib/reporting/module/pnl-report";
import type { SettlementReportView } from "@/lib/reporting/module/settlement-report";
import type { ProductProfitReportView } from "@/lib/reporting/module/product-profit-report";
import type { GroupPerformanceReportView } from "@/lib/reporting/module/group-performance-report";
import type { GlossaryRow } from "@/lib/reporting/weekly-business/glossary";
import type { PeriodChunk } from "@/lib/reporting/weekly-business/period-chunks";

export const WEEKLY_WORKBOOK_SHEET_NAMES = {
  cover: "00 Cover & Data Quality",
  executive: "01 Executive Summary",
  pnl: "02 Profit & Loss",
  settlement: "03 Settlement",
  salesOrders: "04 Sales & Orders KPIs",
  productProfit: "05 Product Profitability",
  brand: "06 Brand Performance",
  category: "07 Category Performance",
  glossary: "08 FE WB Glossary",
  reconciliation: "09 Reconciliation",
  financeDetail: "10 Finance Detail",
  salesDetail: "11 Sales Detail",
  cashFlow: "12 Cash Flow",
} as const;

export type WeeklyDataQuality = {
  financeLatestOperationDate: string | null;
  /** Calendar days between financeLatest and scope.to when incomplete; else null. */
  financeGapDays: number | null;
  financeRecoveryNeeded: boolean;
  financeComplete: boolean;
  financeIncompleteWarning: string | null;
  /** Set when zero finance rows exist for the selected period. */
  financeNoDataMessage: string | null;
  financeRowsInPeriod: number;
  financeLatestInPeriod: string | null;
  financeLatestSource:
    | "marketplace_accounts.finance_latest_operation_date"
    | "wb_finance.max(operation_date)"
    | "wb_finance.in_period"
    | "none";
  scopeTo: string;
  affectedFinanceMetrics: string;
  lastSyncStatus: string | null;
  ordersLatestDate: string | null;
  salesLatestDate: string | null;
  financeLatestDate: string | null;
  isSampleData: boolean;
  warnings: string[];
};

export type WeeklyFinanceDetailRow = {
  operationDate: string;
  nmId: number | null;
  brand: string;
  srid: string | null;
  supplierOperName: string | null;
  operationType: string;
  financeCategory: string | null;
  amount: number;
  sourceKey: string | null;
  realizationReportId: number | null;
};

export type WeeklySalesDetailRow = {
  saleDate: string;
  srid: string;
  nmId: number;
  productName: string;
  brand: string;
  quantity: number;
  priceWithDisc: number | null;
  forPay: number | null;
  isReturn: boolean;
  warehouse: string | null;
};

export type BrandOperBreakdownRow = {
  brand: string;
  supplierOperName: string;
  amount: number;
  lineCount: number;
};

export type ReconciliationComponent = {
  label: string;
  /** Account-level amount from Financial Engine / overview. */
  accountAmount: number;
  /** Σ product-attributed amount (0 when not attributable). */
  allocatedAmount: number;
  /** account − allocated (positive = more cost/revenue at account). */
  unallocatedAmount: number;
  /** How this line affects Net Profit identity (signed). */
  netProfitEffect: number;
  source: string;
};

export type WeeklyReconciliation = {
  accountFinalNetProfit: number;
  sumProductFinalNetProfit: number;
  sumBrandFinalNetProfit: number;
  /** Account − Σ product. */
  difference: number;
  /** Σ component netProfitEffect — should explain difference. */
  explainedUnallocatedNetProfit: number;
  /** difference − explained (rounding / residual). */
  residualDifference: number;
  components: ReconciliationComponent[];
  identityStatement: string;
  brandAttributionNote: string;
  explanation: string;
};

export type WeeklyCashFlow = {
  /** Actual bank transfers when available (overview.cashReceived). */
  actualCashReceived: number | null;
  actualCashReceivedUnavailableReason: string | null;
  actualCashReceivedSource: string;
  expectedWbPayout: number | null;
  expectedWbPayoutUnavailableReason: string | null;
  expectedWbPayoutSource: string;
  /** FE sellerPayout — settlement entitlement, not bank cash. */
  sellerPayoutSettlement: number;
  sellerPayoutSource: string;
  sellerPayoutMeaning: string;
  productCost: number;
  logistics: number;
  storage: number;
  acceptance: number;
  penalties: number;
  otherCosts: number;
  advertising: number;
  estimatedTax: number;
  /** cashReceived − PC − Ads − Tax when cashReceived known; else null. */
  netCashMovement: number | null;
  netCashMovementBasis: string;
  /** Settlement-basis reference = FE finalNetProfit (sellerPayout − PC − Ads − Tax). */
  settlementBasisNetProfit: number;
};

/** FE metrics for one chronological sub-period (same builders, narrower scope). */
export type PeriodBreakdownRow = {
  chunk: PeriodChunk;
  netSales: number;
  marketplaceFee: number;
  revenue: number;
  logistics: number;
  storage: number;
  acceptance: number;
  penalties: number;
  adjustments: number;
  productCost: number;
  advertising: number;
  estimatedTax: number;
  finalNetProfit: number;
  sellerPayout: number;
  ordersCount: number;
  unitsSold: number;
  unitsReturned: number;
  netUnits: number;
  cashReceived: number | null;
  expectedWbPayout: number | null;
};

export type BrandPeriodBreakdownRow = {
  periodLabel: string;
  from: string;
  to: string;
  brand: string;
  netSales: number;
  finalNetProfit: number;
  unitsSold: number;
};

export type WeeklyBusinessWorkbookModel = {
  generatedAt: string;
  financialEngineVersion: string;
  calculationModel: string;
  /** Dynamic title: Unified Business Report — DD.MM.YYYY → DD.MM.YYYY */
  reportTitle: string;
  periodPresetLabel?: string;
  periodBreakdownKind: "none" | "month" | "week";
  periodBreakdown: PeriodBreakdownRow[];
  brandPeriodBreakdown: BrandPeriodBreakdownRow[];
  ctx: ReportContext;
  dataQuality: WeeklyDataQuality;
  hasCommercialActivity: boolean;
  pnl: PnLReportView;
  settlement: SettlementReportView;
  productProfit: ProductProfitReportView;
  brandPerformance: GroupPerformanceReportView;
  categoryPerformance: GroupPerformanceReportView;
  brandOperBreakdown: BrandOperBreakdownRow[];
  reconciliation: WeeklyReconciliation;
  cashFlow: WeeklyCashFlow;
  glossary: GlossaryRow[];
  financeDetail: WeeklyFinanceDetailRow[];
  salesDetail: WeeklySalesDetailRow[];
};
