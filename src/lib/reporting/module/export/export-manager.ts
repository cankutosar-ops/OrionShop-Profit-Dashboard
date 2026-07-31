/**
 * Reporting Export Manager — single entry for xlsx / csv / pdf.
 */

import type {
  ReportExportFormat,
  ReportExportRequest,
  ReportExportResult,
  ReportExporter,
} from "@/lib/reporting/module/export/export-contract";
import {
  isReportExportDocument,
  type ReportExportDocument,
} from "@/lib/reporting/module/export/export-document";
import { exportReportExcel } from "@/lib/reporting/module/export/excel-exporter";
import { exportReportCsv } from "@/lib/reporting/module/export/csv-exporter";
import { exportReportPdf } from "@/lib/reporting/module/export/pdf-exporter";

const MIME: Record<ReportExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv;charset=utf-8",
  pdf: "application/pdf",
};

const EXT: Record<ReportExportFormat, string> = {
  xlsx: "xlsx",
  csv: "csv",
  pdf: "pdf",
};

function resolveFileName(doc: ReportExportDocument, request: ReportExportRequest): string {
  const base = (request.fileName || `${doc.reportId}-${doc.meta.dateFrom}-${doc.meta.dateTo}`)
    .replace(/\.(xlsx|csv|pdf)$/i, "")
    .replace(/[^\w.\-]+/g, "_");
  return `${base}.${EXT[request.format]}`;
}

export function exportMimeType(format: ReportExportFormat): string {
  return MIME[format];
}

export class ReportingExportManager implements ReportExporter {
  readonly formats = ["xlsx", "csv", "pdf"] as const;

  async export(request: ReportExportRequest): Promise<ReportExportResult> {
    if (!isReportExportDocument(request.payload)) {
      return {
        ok: false,
        format: request.format,
        code: "INVALID",
        error:
          "Export payload must be a ReportExportDocument (title, columns, rows, summary, filters).",
      };
    }

    const doc = request.payload;
    if (doc.reportId && request.reportId && doc.reportId !== request.reportId) {
      return {
        ok: false,
        format: request.format,
        code: "INVALID",
        error: `Report id mismatch: document=${doc.reportId} request=${request.reportId}`,
      };
    }

    try {
      let bytes: Uint8Array;
      switch (request.format) {
        case "xlsx":
          bytes = await exportReportExcel(doc);
          break;
        case "csv":
          bytes = exportReportCsv(doc);
          break;
        case "pdf":
          bytes = await exportReportPdf(doc);
          break;
        default:
          return {
            ok: false,
            format: request.format,
            code: "INVALID",
            error: `Unsupported format: ${String(request.format)}`,
          };
      }

      return {
        ok: true,
        format: request.format,
        bytes,
        fileName: resolveFileName(doc, request),
      };
    } catch (err) {
      return {
        ok: false,
        format: request.format,
        code: "INVALID",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const reportingExportManager = new ReportingExportManager();
