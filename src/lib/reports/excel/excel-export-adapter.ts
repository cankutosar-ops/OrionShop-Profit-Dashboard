import type { ReportPayload } from "@/lib/reports/report-engine-types";
import { buildProductReportWorkbook } from "@/lib/reports/templates/product-report-template";

/**
 * Excel Export Adapter (legacy ReportPayload path).
 *
 * Business report Excel is rendered from ReportDocument
 * (`src/lib/reporting/excel`) — do not route business-report here.
 * Product report remains on ReportPayload until its Document sprint.
 */
export async function renderExcelExport(
  payload: ReportPayload
): Promise<ArrayBuffer> {
  if (payload.templateId === "business-report") {
    throw new Error(
      "Business report Excel must be rendered from ReportDocument (Sprint 8.0). Use /api/reports/generate with templateId=business-report."
    );
  }
  if (payload.templateId === "product-report") {
    return buildProductReportWorkbook(payload);
  }

  throw new Error(
    `No Excel layout registered for template "${payload.templateId}"`
  );
}

export function buildReportFilename(
  payload: ReportPayload,
  date = new Date()
): string {
  const day = date.toISOString().split("T")[0];
  const from = payload.scope.from;
  const to = payload.scope.to;
  const safeName = payload.identity.reportName.replace(/[^\w\-]+/g, "_");
  return `${safeName}_v${payload.templateVersion}_${from}_${to}_${day}.xlsx`;
}
