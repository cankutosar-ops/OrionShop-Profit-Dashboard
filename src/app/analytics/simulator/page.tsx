import { DecisionSimulatorPanel } from "@/components/analytics/decision-simulator-panel";
import { PageHeader } from "@/components/layout/page-header";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
} from "@/lib/smart-pricing";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { formatDate } from "@/lib/utils";
import { getDecisionSimulatorPageData } from "@/services/decision-simulator-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    company?: string;
    account?: string;
    sku?: string;
    margin?: string;
    marketing?: string;
  }>;
};

function parsePercent(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default async function DecisionSimulatorPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const targetMargin = parsePercent(params.margin, DEFAULT_TARGET_MARGIN_PERCENT);
  const marketing = parsePercent(params.marketing, DEFAULT_MARKETING_PERCENT);
  const sku = params.sku?.trim().toUpperCase() || "ALEXASIYAH01";

  const data = await getDecisionSimulatorPageData(scope, sku, targetMargin, marketing);

  return (
    <>
      <PageHeader
        title="Decision Simulator"
        description="What is the easiest way to make this SKU profitable? — reuses Product Analytics V7 operational metrics"
      />

      {!data ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to use the simulator.
        </div>
      ) : !data.report ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          SKU <span className="font-mono text-foreground">{sku}</span> not found or has no sales
          history in the selected period.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <p>
              Period:{" "}
              <span className="font-medium text-foreground">
                {formatDate(scope.from)} → {formatDate(scope.to)}
              </span>
              {" · "}
              SKU:{" "}
              <span className="font-mono font-medium text-foreground">{data.report.context.supplierArticle}</span>
            </p>
          </div>

          <DecisionSimulatorPanel
            initialContext={data.report.context}
            initialReport={data.report}
            availableSkus={data.availableSkus}
            currentSku={data.sku}
            rangeFrom={scope.from}
            rangeTo={scope.to}
          />
        </div>
      )}
    </>
  );
}
