/**
 * Reporting Engine — shared data layer for Management Reports.
 *
 * Architecture:
 *   Dashboard → Financial Engine → Analytics Services → Reporting Engine → Report Documents
 *
 * Rules:
 * - Reports consume validated data only (via ReportContext).
 * - No business calculations, Excel/PDF formatting, or independent fetches in sections.
 * - Excel for Business Report: `src/lib/reporting/excel` (ReportDocument renderer).
 * - Product Report Excel remains in `src/lib/reports/` until its Document sprint.
 */

export type {
  ReportAppendix,
  ReportBuildRequest,
  ReportDocument,
  ReportExportOptions,
  ReportInsights,
  ReportKind,
  ReportLocale,
  ReportMetadata,
  ReportPeriod,
  ReportSection,
  ReportSectionKind,
  ReportSummary,
  ReportSummaryMetric,
} from "@/lib/reporting/types";

export {
  loadReportContext,
  type LoadReportContextOptions,
  type ReportContext,
  type ReportContextSync,
  type ReportContextTenant,
} from "@/lib/reporting/report-context";

export {
  buildReportDocument,
  buildReportMetadata,
  defaultExportOptions,
  type ReportBuilderInput,
} from "@/lib/reporting/report-builder";

export {
  buildBusinessReport,
  buildBusinessReportDocument,
  BUSINESS_REPORT_VERSION,
} from "@/lib/reporting/business-report";

export {
  renderBusinessReportWorkbook,
  buildBusinessWorkbookFilename,
  isBusinessDocumentEmpty,
  BUSINESS_WORKBOOK_SHEETS,
} from "@/lib/reporting/excel";

export {
  CALCULATION_MODEL,
  FINANCIAL_ENGINE_VERSION,
  averagePerUnit,
  emptyReportInsights,
  netMarginPercent,
  percentOfRevenue,
} from "@/lib/reporting/section-utils";

export { validateFinancialSummaryAgainstEngine } from "@/lib/reporting/sections/financial-summary";

export {
  buildMarketplaceIntelligence,
  buildMarketplaceIntelligenceDocument,
  MARKETPLACE_INTELLIGENCE_VERSION,
} from "@/lib/reporting/marketplace-intelligence";

export {
  runExecutiveRuleEngine,
  EXECUTIVE_RULE_CATALOG,
  EXECUTIVE_RULE_ENGINE_VERSION,
  getRuleDefinition,
} from "@/lib/reporting/executive-rule-engine";

export { buildProductReport } from "@/lib/reporting/product-report";
export { buildFinancialReport } from "@/lib/reporting/financial-report";
export { buildInventoryReportDocument } from "@/lib/reporting/inventory-report";
export { buildExecutiveReport } from "@/lib/reporting/executive-report";

export * from "@/lib/reporting/sections";
