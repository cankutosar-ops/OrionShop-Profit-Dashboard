/**
 * @deprecated Sprint 8.0 — legacy ReportPayload business workbook removed.
 * Business Excel is rendered from ReportDocument via
 * `src/lib/reporting/excel/render-business-workbook.ts`.
 *
 * This stub exists only to fail loudly if something still imports the old path.
 */

export function buildBusinessReportWorkbook(): never {
  throw new Error(
    "Legacy ReportPayload business workbook was removed in Sprint 8.0. Use renderBusinessReportWorkbook(ReportDocument) from @/lib/reporting/excel."
  );
}
