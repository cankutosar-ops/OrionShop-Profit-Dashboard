export type FreshnessStatus = "CURRENT" | "AWAITING PUBLICATION" | "INCOMPLETE" | "MISSING COST" | "STALE";
export type FreshnessItem = { label: string; status: FreshnessStatus; detail: string };
export type FreshnessSnapshot = {
  dates: { sales: string | null; orders: string | null; finance: string | null; ads: string | null; inventory: string | null };
  finance: { last_error: string | null; active_week_from: string | null; active_week_to: string | null; week_status: string } | null;
  missingCost: number;
  products: number;
  lastSuccessfulSync?: string | null;
};

export function freshnessItems(snapshot: FreshnessSnapshot, through: string): FreshnessItem[] {
  const items = Object.entries(snapshot.dates).map(([entity, latest]): FreshnessItem => {
    const pending = entity === "finance" && snapshot.finance?.last_error?.startsWith("awaiting_publication");
    const incomplete = entity === "finance" && (!snapshot.finance || snapshot.finance.week_status !== "idle");
    return {
      label: entity === "ads" ? "Ads" : entity.charAt(0).toUpperCase() + entity.slice(1),
      status: pending ? "AWAITING PUBLICATION" : !latest || incomplete ? "INCOMPLETE" : latest.slice(0, 10) < through ? "STALE" : "CURRENT",
      detail: `Latest stored date: ${latest?.slice(0, 10) ?? "none"}.` + (pending
        ? ` Publication coverage is not confirmed for ${snapshot.finance?.active_week_from}–${snapshot.finance?.active_week_to}. Finance can lag Sales/Orders; stored rows are retained.`
        : entity === "finance" ? " A stored date alone does not prove publication completeness." : " Current means date freshness, not proof of complete historical coverage."),
    };
  });
  items.push({ label: "Product Cost", status: snapshot.missingCost ? "MISSING COST" : snapshot.products ? "CURRENT" : "INCOMPLETE",
    detail: `${snapshot.missingCost}/${snapshot.products} products lack a currently effective cost. Missing cost remains 0; profit can be overstated. Historical cost coverage may differ.` });
  return items;
}
