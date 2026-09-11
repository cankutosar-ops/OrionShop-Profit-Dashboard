/**
 * Unified Business Excel — multi-sheet export over Financial Engine V4.
 * Works for any selected date range (week, month, multi-month, custom).
 */

export {
  buildWeeklyBusinessWorkbookModel,
  buildReconciliation,
  FINANCE_INCOMPLETE_WARNING,
  FINANCE_NO_DATA_MESSAGE,
} from "@/lib/reporting/weekly-business/build-weekly-workbook-model";

export {
  renderWeeklyBusinessWorkbook,
  buildWeeklyWorkbookFilename,
} from "@/lib/reporting/weekly-business/render-weekly-workbook";

export {
  WEEKLY_WORKBOOK_SHEET_NAMES,
  type WeeklyBusinessWorkbookModel,
  type WeeklyDataQuality,
  type PeriodBreakdownRow,
} from "@/lib/reporting/weekly-business/types";

export { WEEKLY_FE_GLOSSARY } from "@/lib/reporting/weekly-business/glossary";

export {
  buildPeriodChunks,
  formatUnifiedReportTitle,
  formatReportDate,
} from "@/lib/reporting/weekly-business/period-chunks";
