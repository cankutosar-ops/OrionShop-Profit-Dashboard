"use client";

import {
  DISPLAY_MARKETPLACES,
  DISPLAY_MARKETPLACE_LABEL,
  type MarketplaceAccessRow,
} from "@/lib/administration/user-types";

type MarketplaceAccessTableProps = {
  rows: MarketplaceAccessRow[];
  busy?: boolean;
  onToggle?: (marketplaceAccountId: string, granted: boolean) => void;
};

export function MarketplaceAccessTable({
  rows,
  busy,
  onToggle,
}: MarketplaceAccessTableProps) {
  const byCompany = new Map<string, MarketplaceAccessRow[]>();
  for (const row of rows) {
    const list = byCompany.get(row.companyId) ?? [];
    list.push(row);
    byCompany.set(row.companyId, list);
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Marketplace Access</h3>
      <p className="text-xs text-muted-foreground">
        Per company: Wildberries, Ozon, Lamoda, Shopify. Grant or revoke uses existing
        tenant claims (no new AuthZ model).
      </p>

      {byCompany.size === 0 ? (
        <p className="text-sm text-muted-foreground">
          No marketplace accounts under this user&apos;s companies.
        </p>
      ) : (
        [...byCompany.entries()].map(([companyId, companyRows]) => {
          const companyName = companyRows[0]?.companyName ?? companyId;
          return (
            <div key={companyId} className="rounded-xl border border-border p-3">
              <div className="mb-2 text-xs font-semibold text-foreground">{companyName}</div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {DISPLAY_MARKETPLACES.map((mp) => {
                  const has = companyRows.some((r) => r.marketplace === mp && r.granted);
                  const exists = companyRows.some((r) => r.marketplace === mp);
                  return (
                    <span
                      key={mp}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        has
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : exists
                            ? "bg-muted text-muted-foreground"
                            : "border border-dashed border-border text-muted-foreground"
                      }`}
                    >
                      {DISPLAY_MARKETPLACE_LABEL[mp]}
                      {!exists ? " · n/a" : has ? " · on" : " · off"}
                    </span>
                  );
                })}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Account</th>
                      <th className="py-1 pr-3 font-medium">Marketplace</th>
                      <th className="py-1 pr-3 font-medium">Access</th>
                      <th className="py-1 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companyRows.map((row) => (
                      <tr key={row.marketplaceAccountId} className="border-t border-border">
                        <td className="py-2 pr-3 font-medium">{row.accountName}</td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {row.marketplaceLabel}
                        </td>
                        <td className="py-2 pr-3">
                          {row.granted ? "Granted" : "Revoked"}
                          {row.unrestrictedUnderCompany && row.granted
                            ? " (company-wide)"
                            : ""}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded-[var(--radius-control)] border border-border px-2 py-0.5 text-[11px]"
                            onClick={() =>
                              onToggle?.(row.marketplaceAccountId, !row.granted)
                            }
                          >
                            {row.granted ? "Revoke" : "Grant"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
