import type { ScopedDateRange } from "@/types/database";
import {
  getCompanyById,
  getMarketplaceAccountSyncState,
} from "@/services/marketplace-account-service";
import type {
  ReportIdentity,
  ReportPeriodPreset,
  ReportTemplateVersion,
} from "@/lib/reports/report-engine-types";

const MARKETPLACE_LABELS: Record<string, string> = {
  wildberries: "Wildberries",
  ozon: "Ozon",
  lamoda: "Lamoda",
};

const PRESET_LABELS: Record<ReportPeriodPreset, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  last_6_months: "Last 6 Months",
  yearly: "Yearly",
  custom: "Custom Date Range",
};

/**
 * Assembles blueprint §15 identity + freshness from existing tenant / sync services.
 * No business calculations.
 */
export async function buildReportIdentity(input: {
  reportName: string;
  templateVersion: ReportTemplateVersion;
  scope: ScopedDateRange;
  generatedAt: string;
  periodPreset?: ReportPeriodPreset;
}): Promise<ReportIdentity> {
  const company = await getCompanyById(input.scope.companyId);
  const account =
    company?.accounts.find((a) => a.id === input.scope.marketplaceAccountId) ?? null;
  const syncState = await getMarketplaceAccountSyncState(input.scope.marketplaceAccountId);

  const marketplaceKey = account?.marketplace ?? "wildberries";
  const currency = company?.currency?.trim() || "RUB";

  return {
    reportName: input.reportName,
    company: company?.name ?? input.scope.companyId,
    marketplace: MARKETPLACE_LABELS[marketplaceKey] ?? marketplaceKey,
    account: account?.account_name ?? input.scope.marketplaceAccountId,
    reportingPeriod: {
      from: input.scope.from,
      to: input.scope.to,
      presetLabel: input.periodPreset ? PRESET_LABELS[input.periodPreset] : undefined,
    },
    currency,
    generatedAt: input.generatedAt,
    templateVersion: input.templateVersion,
    lastSuccessfulSyncAt: syncState?.last_successful_sync_at ?? null,
  };
}

export function periodPresetLabel(preset?: ReportPeriodPreset): string | undefined {
  return preset ? PRESET_LABELS[preset] : undefined;
}
