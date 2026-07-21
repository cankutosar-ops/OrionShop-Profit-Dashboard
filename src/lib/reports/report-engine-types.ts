import type { ScopedDateRange } from "@/types/database";

export type ReportTemplateId = string;
export type ReportTemplateVersion = number;
export type ReportTemplateStatus = "draft" | "active" | "deprecated";

export type ReportPeriodPreset =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "last_6_months"
  | "yearly"
  | "custom";

export type ReportRequest = {
  templateId: ReportTemplateId;
  templateVersion?: ReportTemplateVersion;
  scope: ScopedDateRange;
  periodPreset?: ReportPeriodPreset;
  options?: Record<string, unknown>;
  dataMode?: "live" | "snapshot";
  locale?: "en" | "ru" | "tr";
};

export type ReportSection<T = unknown> = {
  id: string;
  titleKey: string;
  data: T;
};

/** Standard identity + freshness metadata — blueprint §15. Not a worksheet. */
export type ReportIdentity = {
  reportName: string;
  company: string;
  marketplace: string;
  account: string;
  reportingPeriod: { from: string; to: string; presetLabel?: string };
  currency: string;
  generatedAt: string;
  templateVersion: ReportTemplateVersion;
  lastSuccessfulSyncAt: string | null;
};

export type ReportPayload = {
  templateId: ReportTemplateId;
  templateVersion: ReportTemplateVersion;
  generatedAt: string;
  scope: ScopedDateRange;
  periodPreset?: ReportPeriodPreset;
  locale: string;
  snapshotId: string | null;
  identity: ReportIdentity;
  sections: ReportSection[];
  meta?: { warnings?: string[]; rowCounts?: Record<string, number> };
};

export type ReportNoDataResult = {
  ok: false;
  code: "NO_DATA_FOR_PERIOD";
  messageKey: string;
  message: string;
  scope: ScopedDateRange;
};

export type ReportRunSuccess = {
  ok: true;
  payload: ReportPayload;
};

export type ReportRunResult = ReportRunSuccess | ReportNoDataResult;

export type ExportFormat = "xlsx" | "csv" | "json" | "pdf";

export type ExportAdapter = {
  format: ExportFormat;
  render(payload: ReportPayload): Promise<ArrayBuffer | string>;
};

export type ReportExportSuccess = {
  ok: true;
  format: ExportFormat;
  filename: string;
  body: ArrayBuffer | string;
  payload: ReportPayload;
};

export type ReportExportResult = ReportExportSuccess | ReportNoDataResult;

/** Minimal Business Report KPI section (Sprint 7.1). */
export type BusinessReportKpiData = {
  revenue: number;
  profit: number;
  orders: number;
  purchases: number;
};
