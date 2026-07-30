import { Suspense } from "react";
import { CoverageTable } from "@/components/monitoring/coverage-table";
import { FreshnessCards } from "@/components/monitoring/freshness-cards";
import { LatestSyncTable } from "@/components/monitoring/latest-sync-table";
import { OperationalAlertsPanel } from "@/components/monitoring/operational-alerts-panel";
import { ProductionHealthScoreCard } from "@/components/monitoring/production-health-score-card";
import { SchemaHealthPanel } from "@/components/monitoring/schema-health-panel";
import { VerificationAuditSection } from "@/components/monitoring/verification-audit-section";
import { PageHeader } from "@/components/layout/page-header";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getProductionHealthReport } from "@/services/production-health-service";
import { listVerificationReports } from "@/services/sync-verification-report-repository";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function ProductionHealthPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const env = getSupabaseEnv();

  const report = env.isConfigured
    ? await getProductionHealthReport(scope.marketplaceAccountId)
    : null;

  const latestVerification =
    env.isConfigured
      ? (await listVerificationReports(scope.marketplaceAccountId, 1))[0] ?? null
      : null;

  return (
    <>
      <PageHeader
        title="Production Health"
        description="Sync freshness, coverage, schema, verification history, and operational alerts — diagnostics only"
      />

      {!report ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to view production health.
        </div>
      ) : (
        <div className="space-y-8">
          <ProductionHealthScoreCard report={report} />

          {latestVerification ? (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Latest Verification
              </p>
              <p className="mt-1 font-medium text-foreground">
                {latestVerification.overall_result} · {latestVerification.health_score}% ·{" "}
                {new Date(latestVerification.verified_at).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Schema {latestVerification.schema_status} · Orders {latestVerification.orders_status} ·
                Sales {latestVerification.sales_status} · Finance {latestVerification.finance_status} ·
                Inventory {latestVerification.inventory_status}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
              No verification snapshots stored yet. Apply migration{" "}
              <code className="text-xs">20260724190000_sync_verification_reports</code> if needed,
              then sync or run verification below.
            </div>
          )}

          <FreshnessCards report={report} />
          <CoverageTable report={report} />
          <LatestSyncTable report={report} />
          <SchemaHealthPanel report={report} />
          <OperationalAlertsPanel report={report} />

          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading verification audit…</p>}>
            <VerificationAuditSection />
          </Suspense>
        </div>
      )}
    </>
  );
}
