/**
 * Universal report model — consumed by Excel, PDF, Preview, and API later.
 * Presentation only: no business calculations live here.
 */

export type ReportKind =
  | "business"
  | "product"
  | "financial"
  | "inventory"
  | "executive"
  | "marketplace";

export type ReportLocale = "en" | "ru" | "tr";

export type ReportPeriod = {
  from: string;
  to: string;
  presetLabel?: string;
};

export type ReportMetadata = {
  reportId: string;
  reportKind: ReportKind;
  reportName: string;
  version: number;
  generatedAt: string;
  locale: ReportLocale;
  company: {
    id: string;
    name: string;
    currency: string;
    locale?: string;
  };
  marketplace: {
    accountId: string;
    accountName: string;
    marketplace: string;
  };
  brand: {
    id: string | null;
    name: string | null;
  };
  period: ReportPeriod;
  sync: {
    lastSuccessfulSyncAt: string | null;
    lastSyncStatus: string | null;
    lifecycleStatus: string | null;
  };
};

export type ReportSummaryMetric = {
  id: string;
  label: string;
  value: number | string | null;
  format?: "currency" | "number" | "percent" | "text";
  unit?: string;
};

export type ReportSummary = {
  headline: string;
  metrics: ReportSummaryMetric[];
  notes?: string[];
};

export type ReportSectionKind =
  | "cover"
  | "executive-summary"
  | "financial-summary"
  | "settlement-reconciliation"
  | "brand-profitability"
  | "product-performance"
  | "financial-ratios"
  | "report-health"
  | "profitability"
  | "marketplace-costs"
  | "logistics"
  | "returns"
  | "trends"
  | "inventory"
  | "products"
  | "appendix"
  | string;

export type ReportSection<T = unknown> = {
  id: string;
  kind: ReportSectionKind;
  title: string;
  description?: string;
  /** Structured data only — no UI / Excel / PDF formatting. */
  data: T;
};

export type ReportAppendix = {
  definitions?: { term: string; definition: string }[];
  warnings?: string[];
  sourceNotes?: string[];
};

export type ReportExportOptions = {
  /** Formats this document is prepared for — generation comes later. */
  supportedFormats: Array<"xlsx" | "pdf" | "json" | "preview">;
  suggestedFilename: string;
  includeAppendix: boolean;
};

/**
 * Future AI insight containers — empty until an insight sprint populates them.
 * Do not generate commentary in the Reporting Engine.
 */
export type ReportInsights = {
  highlights: string[];
  warnings: string[];
  opportunities: string[];
};

/**
 * Universal report document — single source for all report surfaces.
 * Additive fields only — existing consumers remain compatible.
 */
export type ReportDocument = {
  metadata: ReportMetadata;
  summary: ReportSummary;
  sections: ReportSection[];
  appendix: ReportAppendix;
  exportOptions: ReportExportOptions;
  /** Optional management-intelligence placeholders (Sprint 7.6+). */
  insights?: ReportInsights;
};

export type ReportBuildRequest = {
  kind: ReportKind;
  scope: import("@/types/database").ScopedDateRange;
  locale?: ReportLocale;
  periodPresetLabel?: string;
  options?: Record<string, unknown>;
};
