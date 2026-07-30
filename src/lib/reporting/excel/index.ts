/**
 * Excel renderers for ReportDocument — presentation only.
 */
export {
  renderBusinessReportWorkbook,
  buildBusinessWorkbookFilename,
  isBusinessDocumentEmpty,
  BUSINESS_WORKBOOK_SHEETS,
} from "@/lib/reporting/excel/render-business-workbook";

export {
  NOT_AVAILABLE,
  NUM_FMT,
  findSectionData,
  asExcelPercent,
  asNumber,
} from "@/lib/reporting/excel/workbook-kit";
