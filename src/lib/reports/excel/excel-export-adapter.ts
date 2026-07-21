import type { ReportPayload } from "@/lib/reports/report-engine-types";
import { buildBusinessReportWorkbook } from "@/lib/reports/templates/business-report-template";
import { buildProductReportWorkbook } from "@/lib/reports/templates/product-report-template";

/**
 * Excel Export Adapter.
 * Serializes ReportPayload only — never calculates business metrics.
 */
export async function renderExcelExport(payload: ReportPayload): Promise<ArrayBuffer> {
  if (payload.templateId === "business-report") {
    return buildBusinessReportWorkbook(payload);
  }
  if (payload.templateId === "product-report") {
    return buildProductReportWorkbook(payload);
  }

  throw new Error(`No Excel layout registered for template "${payload.templateId}"`);
}

export function buildReportFilename(payload: ReportPayload, date = new Date()): string {
  const day = date.toISOString().split("T")[0];
  const from = payload.scope.from;
  const to = payload.scope.to;
  const safeName = payload.identity.reportName.replace(/[^\w\-]+/g, "_");
  return `${safeName}_v${payload.templateVersion}_${from}_${to}_${day}.xlsx`;
}
