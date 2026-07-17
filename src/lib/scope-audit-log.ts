import type { ScopedDateRange } from "@/types/database";

export type ScopeQueryStats = {
  orders: number;
  sales: number;
  finance: number;
  ads?: number;
  inventory?: number;
};

/**
 * Logs the effective historical scope used by a page/service.
 * Enabled in development or when SCOPE_AUDIT=1.
 */
export function logScopeAudit(
  page: string,
  requested: Pick<ScopedDateRange, "from" | "to">,
  resolved: ScopedDateRange,
  stats: ScopeQueryStats
): void {
  if (process.env.SCOPE_AUDIT !== "1" && process.env.NODE_ENV === "production") {
    return;
  }

  console.log(`[SCOPE AUDIT] ${page}`);
  console.log(`  Requested: from=${requested.from} to=${requested.to}`);
  console.log(
    `  Resolved:  from=${resolved.from} to=${resolved.to} account=${resolved.marketplaceAccountId} brand=${resolved.brandId ?? "all"}`
  );
  console.log(
    `  Rows: orders=${stats.orders} sales=${stats.sales} finance=${stats.finance}` +
      (stats.ads !== undefined ? ` ads=${stats.ads}` : "") +
      (stats.inventory !== undefined ? ` inventory=${stats.inventory}` : "")
  );
}
