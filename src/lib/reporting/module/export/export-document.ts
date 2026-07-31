/**
 * Sprint 9.5 — Shared export document model.
 * Reports supply presentation data only; formatters never recalculate finance.
 */

export type ReportExportValueType =
  | "text"
  | "currency"
  | "percent"
  | "integer"
  | "number";

export type ReportExportColumn = {
  key: string;
  header: string;
  type: ReportExportValueType;
};

export type ReportExportSummaryItem = {
  id?: string;
  label: string;
  value: number;
  type: ReportExportValueType;
};

export type ReportExportFilter = {
  label: string;
  value: string;
};

export type ReportExportMeta = {
  company: string;
  marketplace: string;
  dateFrom: string;
  dateTo: string;
  filters: ReportExportFilter[];
};

/**
 * Canonical export input — every report builds this; exporters only format it.
 */
export type ReportExportDocument = {
  reportId: string;
  title: string;
  generatedAt: string;
  currency: string;
  meta: ReportExportMeta;
  summary: ReportExportSummaryItem[];
  columns: ReportExportColumn[];
  rows: Array<Record<string, string | number | null | undefined>>;
};

export function isReportExportDocument(value: unknown): value is ReportExportDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as ReportExportDocument;
  return (
    typeof d.reportId === "string" &&
    typeof d.title === "string" &&
    typeof d.generatedAt === "string" &&
    Array.isArray(d.columns) &&
    Array.isArray(d.rows) &&
    Array.isArray(d.summary) &&
    d.meta != null &&
    typeof d.meta === "object"
  );
}
