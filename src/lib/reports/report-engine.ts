import { buildReportIdentity } from "@/lib/reports/report-payload";
import {
  buildReportFilename,
  renderExcelExport,
} from "@/lib/reports/excel/excel-export-adapter";
import { getReportTemplate } from "@/lib/reports/report-template-registry";
import type {
  ReportExportResult,
  ReportRequest,
  ReportRunResult,
} from "@/lib/reports/report-engine-types";

/**
 * Report Engine — orchestrates providers → payload → export.
 * Does not calculate business data.
 */
export async function runReport(request: ReportRequest): Promise<ReportRunResult> {
  const template = getReportTemplate(request.templateId, request.templateVersion);
  const generatedAt = new Date().toISOString();
  const locale = request.locale ?? "en";

  const sections = await template.buildSections(request.scope);

  if (template.isEmpty(sections)) {
    return {
      ok: false,
      code: "NO_DATA_FOR_PERIOD",
      messageKey: "report.error.noDataForPeriod",
      message: `No business data exists for the selected period (${request.scope.from} → ${request.scope.to}).`,
      scope: request.scope,
    };
  }

  const identity = await buildReportIdentity({
    reportName: template.reportName,
    templateVersion: template.version,
    scope: request.scope,
    generatedAt,
    periodPreset: request.periodPreset,
  });

  return {
    ok: true,
    payload: {
      templateId: template.templateId,
      templateVersion: template.version,
      generatedAt,
      scope: request.scope,
      periodPreset: request.periodPreset,
      locale,
      snapshotId: null,
      identity,
      sections,
      meta: {
        rowCounts: Object.fromEntries(
          sections.map((section) => [section.id, 1])
        ),
      },
    },
  };
}

export async function exportReport(request: ReportRequest): Promise<ReportExportResult> {
  const run = await runReport(request);
  if (!run.ok) return run;

  const body = await renderExcelExport(run.payload);
  return {
    ok: true,
    format: "xlsx",
    filename: buildReportFilename(run.payload),
    body,
    payload: run.payload,
  };
}
