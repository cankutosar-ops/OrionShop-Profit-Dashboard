/**
 * Normalized ReportContext — every report receives the same object.
 * Loaded once from existing dashboard / module services.
 * Reports must not fetch independently or recalculate business math.
 */
import {
  getCompanyById,
  getMarketplaceAccountSyncState,
} from "@/services/marketplace-account-service";
import {
  getDashboardListData,
  getOverviewMetrics,
  getProductProfitability,
} from "@/services/dashboard-service";
import { getInventoryReport } from "@/services/inventory-report-service";
import type {
  GroupedProfitability,
  ModelBProfitMetrics,
  OverviewMetrics,
  ProductProfitability,
  ScopedDateRange,
  SyncLifecycleStatus,
  SyncStatus,
} from "@/types/database";
import type { ReportLocale } from "@/lib/reporting/types";

const MARKETPLACE_LABELS: Record<string, string> = {
  wildberries: "Wildberries",
  ozon: "Ozon",
  lamoda: "Lamoda",
};

export type ReportContextTenant = {
  companyId: string;
  companyName: string;
  currency: string;
  language: string | null;
  accountId: string;
  accountName: string;
  marketplace: string;
  marketplaceLabel: string;
  brandId: string | null;
  brandName: string | null;
};

export type ReportContextSync = {
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncStatus: SyncStatus | null;
  lifecycleStatus: SyncLifecycleStatus | null;
  financeLatestOperationDate: string | null;
  financeGapDays: number | null;
  financeRecoveryNeeded: boolean;
};

export type ReportContext = {
  scope: ScopedDateRange;
  locale: ReportLocale;
  periodPresetLabel?: string;
  generatedAt: string;
  tenant: ReportContextTenant;
  sync: ReportContextSync;
  /** Trusted Financial Engine V4 result (via dashboard overview). */
  financialEngine: ModelBProfitMetrics;
  /** Dashboard KPIs / overview (includes Model B, settlement, quantities). */
  overview: OverviewMetrics;
  /** Product-level analytics rows (Model B–aligned). */
  products: ProductProfitability[];
  categories: GroupedProfitability[];
  brands: GroupedProfitability[];
  /** Inventory module metrics when available. */
  inventory: Awaited<ReturnType<typeof getInventoryReport>> | null;
  meta: {
    isSampleData: boolean;
    warnings: string[];
  };
};

export type LoadReportContextOptions = {
  locale?: ReportLocale;
  periodPresetLabel?: string;
  /** Skip inventory fetch (lighter contexts). Default false. */
  skipInventory?: boolean;
};

/**
 * Load one shared ReportContext for the given scope.
 * Parallel service calls — no business recalculation.
 */
export async function loadReportContext(
  scope: ScopedDateRange,
  options: LoadReportContextOptions = {}
): Promise<ReportContext> {
  const locale = options.locale ?? "en";
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  const [company, syncState, overview, products, listData, inventory] =
    await Promise.all([
      getCompanyById(scope.companyId),
      getMarketplaceAccountSyncState(scope.marketplaceAccountId),
      getOverviewMetrics(scope),
      getProductProfitability(scope),
      getDashboardListData(scope),
      options.skipInventory
        ? Promise.resolve(null)
        : getInventoryReport(scope).catch((err) => {
            warnings.push(
              `inventory_unavailable: ${err instanceof Error ? err.message : "unknown"}`
            );
            return null;
          }),
    ]);

  const account =
    company?.accounts.find((row) => row.id === scope.marketplaceAccountId) ?? null;
  const marketplaceKey = account?.marketplace ?? "wildberries";

  let brandName: string | null = null;
  if (scope.brandId) {
    brandName = listData.brands.find((b) => b.id === scope.brandId)?.name ?? null;
  }

  if (listData.isSampleData) {
    warnings.push("sample_data");
  }

  return {
    scope,
    locale,
    periodPresetLabel: options.periodPresetLabel,
    generatedAt,
    tenant: {
      companyId: scope.companyId,
      companyName: company?.name ?? scope.companyId,
      currency: company?.currency?.trim() || "RUB",
      language: company?.language ?? null,
      accountId: scope.marketplaceAccountId,
      accountName: account?.account_name ?? scope.marketplaceAccountId,
      marketplace: marketplaceKey,
      marketplaceLabel: MARKETPLACE_LABELS[marketplaceKey] ?? marketplaceKey,
      brandId: scope.brandId ?? null,
      brandName,
    },
    sync: {
      lastSyncAt: syncState?.last_sync_at ?? null,
      lastSuccessfulSyncAt: syncState?.last_successful_sync_at ?? null,
      lastSyncStatus: syncState?.last_sync_status ?? null,
      lifecycleStatus: syncState?.sync_lifecycle_status ?? null,
      financeLatestOperationDate: syncState?.finance_latest_operation_date ?? null,
      financeGapDays: syncState?.finance_gap_days ?? null,
      financeRecoveryNeeded: Boolean(syncState?.finance_recovery_needed),
    },
    financialEngine: overview.modelBProfit,
    overview,
    products,
    categories: listData.categories,
    brands: listData.brands,
    inventory,
    meta: {
      isSampleData: listData.isSampleData,
      warnings,
    },
  };
}
