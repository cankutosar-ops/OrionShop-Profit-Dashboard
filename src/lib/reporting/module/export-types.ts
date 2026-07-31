/**
 * Reporting Module export types + default exporter.
 * Sprint 9.5 — real Excel / CSV / PDF via ReportingExportManager.
 */

export type {
  ReportExportFormat,
  ReportExportRequest,
  ReportExportResult,
  ReportExporter,
} from "@/lib/reporting/module/export/export-contract";

export type {
  ReportExportDocument,
  ReportExportColumn,
  ReportExportSummaryItem,
  ReportExportFilter,
  ReportExportMeta,
  ReportExportValueType,
} from "@/lib/reporting/module/export/export-document";

export {
  reportingExportManager,
  ReportingExportManager,
  exportMimeType,
} from "@/lib/reporting/module/export/export-manager";

import type {
  ReportExportRequest,
  ReportExportResult,
  ReportExporter,
} from "@/lib/reporting/module/export/export-contract";
import { reportingExportManager } from "@/lib/reporting/module/export/export-manager";

/** Kept for historical verify scripts that assert the stub contract. */
export class StubReportExporter implements ReportExporter {
  readonly formats = ["xlsx", "csv", "pdf"] as const;

  async export(request: ReportExportRequest): Promise<ReportExportResult> {
    return {
      ok: false,
      format: request.format,
      code: "NOT_IMPLEMENTED",
      error: `Export to ${request.format.toUpperCase()} is not implemented yet.`,
    };
  }
}

/** Production exporter — shared by all reporting pages. */
export const defaultReportExporter: ReportExporter = reportingExportManager;
