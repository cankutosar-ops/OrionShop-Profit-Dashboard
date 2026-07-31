/**
 * Export contract types (no implementation imports — avoids cycles).
 */

export type ReportExportFormat = "xlsx" | "csv" | "pdf";

export type ReportExportRequest = {
  reportId: string;
  format: ReportExportFormat;
  /** ReportExportDocument prepared by the report (never recompute finance here). */
  payload: unknown;
  fileName?: string;
};

export type ReportExportResult =
  | { ok: true; format: ReportExportFormat; bytes: Uint8Array; fileName: string }
  | { ok: false; format: ReportExportFormat; error: string; code: "NOT_IMPLEMENTED" | "INVALID" };

export interface ReportExporter {
  readonly formats: readonly ReportExportFormat[];
  export(request: ReportExportRequest): Promise<ReportExportResult>;
}
