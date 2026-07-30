import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import {
  BUSINESS_REPORT_VERSION,
} from "@/lib/reporting/business-report-version";

export type CoverData = {
  reportName: string;
  reportKind: "business";
  reportVersion: number;
  company: { id: string; name: string };
  marketplace: { accountId: string; accountName: string; marketplace: string };
  brandFilter: { id: string | null; name: string | null };
  period: { from: string; to: string; presetLabel?: string };
  generatedAt: string;
  currency: string;
  locale: string;
};

export function buildCoverSection(ctx: ReportContext): ReportSection<CoverData> {
  return {
    id: "cover",
    kind: "cover",
    title: "Cover",
    description: "Business Performance Report identity",
    data: {
      reportName: "Business Performance Report",
      reportKind: "business",
      reportVersion: BUSINESS_REPORT_VERSION,
      company: {
        id: ctx.tenant.companyId,
        name: ctx.tenant.companyName,
      },
      marketplace: {
        accountId: ctx.tenant.accountId,
        accountName: ctx.tenant.accountName,
        marketplace: ctx.tenant.marketplaceLabel,
      },
      brandFilter: {
        id: ctx.tenant.brandId,
        name: ctx.tenant.brandName,
      },
      period: {
        from: ctx.scope.from,
        to: ctx.scope.to,
        presetLabel: ctx.periodPresetLabel,
      },
      generatedAt: ctx.generatedAt,
      currency: ctx.tenant.currency,
      locale: ctx.locale,
    },
  };
}
