export type FreshnessStatus = "CURRENT" | "AWAITING PUBLICATION" | "INCOMPLETE" | "STALE";
export type FreshnessItem = {
  label: string;
  status: FreshnessStatus;
  latestDate: string | null;
  detail: string;
};
export type FreshnessSnapshot = {
  dates: { sales: string | null; orders: string | null; finance: string | null; ads: string | null; inventory: string | null };
  finance: { last_error: string | null; active_week_from: string | null; active_week_to: string | null; week_status: string } | null;
  lastSuccessfulSync?: string | null;
};

export function freshnessItems(snapshot: FreshnessSnapshot, through: string): FreshnessItem[] {
  const items = Object.entries(snapshot.dates).map(([entity, latest]): FreshnessItem => {
    const pending = entity === "finance" && snapshot.finance?.last_error?.startsWith("awaiting_publication");
    const incomplete = entity === "finance" && (!snapshot.finance || snapshot.finance.week_status !== "idle");
    const status = pending ? "AWAITING PUBLICATION" : !latest || incomplete ? "INCOMPLETE" : latest.slice(0, 10) < through ? "STALE" : "CURRENT";
    const detail = pending
      ? `Publication coverage is not confirmed for ${snapshot.finance?.active_week_from}–${snapshot.finance?.active_week_to}. Finance can lag Sales/Orders; stored rows are retained.`
      : !latest
        ? "No stored date is available for the selected account."
        : incomplete
          ? "The active Finance period is not complete. Stored rows are retained."
          : status === "STALE"
            ? `Stored data ends before the selected period end (${through}).`
            : entity === "finance"
              ? "A stored date alone does not prove publication completeness."
              : "Date freshness is current; historical gaps may still exist.";
    return {
      label: entity === "ads" ? "Ads" : entity.charAt(0).toUpperCase() + entity.slice(1),
      status,
      latestDate: latest?.slice(0, 10) ?? null,
      detail,
    };
  });
  return items;
}
