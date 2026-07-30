import Link from "next/link";

type MarketplaceIntelligenceCardProps = {
  previewHref: string;
  periodLabel: string;
  lastSyncLabel: string;
};

/**
 * Hub card for Marketplace Intelligence (Sprint 8.1).
 */
export function MarketplaceIntelligenceCard({
  previewHref,
  periodLabel,
  lastSyncLabel,
}: MarketplaceIntelligenceCardProps) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Intelligence workspace
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            Marketplace Intelligence
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Decision support that ordinary Wildberries reports do not provide —
            category investment signals, warehouse contribution, product
            insight boards, and deterministic executive observations.
          </p>
        </div>
        <span className="rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-success">
          Available
        </span>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Reporting Period</dt>
          <dd className="mt-0.5 font-medium">{periodLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last Synchronization</dt>
          <dd className="mt-0.5 font-medium">{lastSyncLabel}</dd>
        </div>
      </dl>

      <ul className="mt-4 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
        <li>· Category Intelligence</li>
        <li>· Product Insight boards</li>
        <li>· Warehouse Intelligence</li>
        <li>· Executive Insights (rules)</li>
        <li>· Engagement — Coming Soon</li>
        <li>· Competitive / Customer — Coming Soon</li>
      </ul>

      <div className="mt-6">
        <Link
          href={previewHref}
          className="inline-flex items-center rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Open Marketplace Intelligence
        </Link>
      </div>
    </article>
  );
}
