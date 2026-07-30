/**
 * ReportBuilder — assembles ReportDocument from ReportContext + section data.
 * No business calculations; presentation assembly only.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type {
  ReportAppendix,
  ReportDocument,
  ReportExportOptions,
  ReportInsights,
  ReportKind,
  ReportMetadata,
  ReportSection,
  ReportSummary,
} from "@/lib/reporting/types";
import { emptyReportInsights } from "@/lib/reporting/section-utils";

const REPORT_NAMES: Record<ReportKind, string> = {
  business: "Business Performance Report",
  product: "Product Performance Report",
  financial: "Financial Report",
  inventory: "Inventory Report",
  executive: "Executive Report",
  marketplace: "Marketplace Intelligence",
};

export type ReportBuilderInput = {
  kind: ReportKind;
  context: ReportContext;
  /** Section builders return structured data only. */
  sections: ReportSection[];
  summary: ReportSummary;
  appendix?: ReportAppendix;
  exportOptions?: Partial<ReportExportOptions>;
  /** Future AI containers — defaults to empty arrays. */
  insights?: ReportInsights;
  /** Bump when section contracts change. */
  version?: number;
};

function slugifyFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function buildReportMetadata(
  kind: ReportKind,
  context: ReportContext,
  version: number
): ReportMetadata {
  return {
    reportId: `${kind}-${context.tenant.accountId}-${context.scope.from}-${context.scope.to}`,
    reportKind: kind,
    reportName: REPORT_NAMES[kind],
    version,
    generatedAt: context.generatedAt,
    locale: context.locale,
    company: {
      id: context.tenant.companyId,
      name: context.tenant.companyName,
      currency: context.tenant.currency,
      locale: context.tenant.language ?? undefined,
    },
    marketplace: {
      accountId: context.tenant.accountId,
      accountName: context.tenant.accountName,
      marketplace: context.tenant.marketplaceLabel,
    },
    brand: {
      id: context.tenant.brandId,
      name: context.tenant.brandName,
    },
    period: {
      from: context.scope.from,
      to: context.scope.to,
      presetLabel: context.periodPresetLabel,
    },
    sync: {
      lastSuccessfulSyncAt: context.sync.lastSuccessfulSyncAt,
      lastSyncStatus: context.sync.lastSyncStatus,
      lifecycleStatus: context.sync.lifecycleStatus,
    },
  };
}

export function defaultExportOptions(
  kind: ReportKind,
  context: ReportContext,
  overrides?: Partial<ReportExportOptions>
): ReportExportOptions {
  const company = slugifyFilenamePart(context.tenant.companyName) || "company";
  const account = slugifyFilenamePart(context.tenant.accountName) || "account";
  const suggestedFilename = `${kind}-report_${company}_${account}_${context.scope.from}_${context.scope.to}`;

  return {
    supportedFormats: ["json", "preview", "xlsx", "pdf"],
    suggestedFilename,
    includeAppendix: true,
    ...overrides,
  };
}

/**
 * Build one normalized ReportDocument.
 * Callers supply sections + summary; builder only wraps metadata / export options.
 */
export function buildReportDocument(input: ReportBuilderInput): ReportDocument {
  const version = input.version ?? 1;
  const appendix: ReportAppendix = {
    definitions: input.appendix?.definitions ?? [],
    warnings: [
      ...(input.context.meta.warnings ?? []),
      ...(input.appendix?.warnings ?? []),
    ],
    sourceNotes: [
      "All financial figures are sourced from Financial Engine V4 via dashboard services.",
      "This document contains structured data only — no Excel/PDF formatting.",
      ...(input.appendix?.sourceNotes ?? []),
    ],
  };

  return {
    metadata: buildReportMetadata(input.kind, input.context, version),
    summary: input.summary,
    sections: input.sections,
    appendix,
    exportOptions: defaultExportOptions(
      input.kind,
      input.context,
      input.exportOptions
    ),
    insights: input.insights ?? emptyReportInsights(),
  };
}
