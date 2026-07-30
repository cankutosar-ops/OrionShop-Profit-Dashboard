/**
 * Appendix — report metadata, filters, sync, calculation model.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import {
  BUSINESS_REPORT_VERSION,
} from "@/lib/reporting/business-report-version";
import {
  CALCULATION_MODEL,
  FINANCIAL_ENGINE_VERSION,
} from "@/lib/reporting/section-utils";

export type AppendixSectionData = {
  reportMetadata: {
    reportKind: "business";
    reportVersion: number;
    generatedAt: string;
    locale: string;
    currency: string;
  };
  filters: {
    companyId: string;
    companyName: string;
    marketplaceAccountId: string;
    marketplaceAccountName: string;
    marketplace: string;
    brandId: string | null;
    brandName: string | null;
    periodFrom: string;
    periodTo: string;
    periodPresetLabel?: string;
  };
  syncTimestamp: {
    lastSyncAt: string | null;
    lastSuccessfulSyncAt: string | null;
    lastSyncStatus: string | null;
    lifecycleStatus: string | null;
    financeLatestOperationDate: string | null;
    financeGapDays: number | null;
    financeRecoveryNeeded: boolean;
  };
  calculationModel: string;
  financialEngineVersion: string;
  warnings: string[];
  isSampleData: boolean;
};

export function buildAppendixSection(
  ctx: ReportContext
): ReportSection<AppendixSectionData> {
  return {
    id: "appendix",
    kind: "appendix",
    title: "Appendix",
    description: "Report metadata, filters, sync freshness, and calculation model",
    data: {
      reportMetadata: {
        reportKind: "business",
        reportVersion: BUSINESS_REPORT_VERSION,
        generatedAt: ctx.generatedAt,
        locale: ctx.locale,
        currency: ctx.tenant.currency,
      },
      filters: {
        companyId: ctx.tenant.companyId,
        companyName: ctx.tenant.companyName,
        marketplaceAccountId: ctx.tenant.accountId,
        marketplaceAccountName: ctx.tenant.accountName,
        marketplace: ctx.tenant.marketplaceLabel,
        brandId: ctx.tenant.brandId,
        brandName: ctx.tenant.brandName,
        periodFrom: ctx.scope.from,
        periodTo: ctx.scope.to,
        periodPresetLabel: ctx.periodPresetLabel,
      },
      syncTimestamp: { ...ctx.sync },
      calculationModel: CALCULATION_MODEL,
      financialEngineVersion: FINANCIAL_ENGINE_VERSION,
      warnings: ctx.meta.warnings,
      isSampleData: ctx.meta.isSampleData,
    },
  };
}
