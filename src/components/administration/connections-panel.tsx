"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ComingSoonPlatformCard,
  MarketplaceConnectionCard,
} from "@/components/administration/marketplace-connection-card";
import { AdminSection } from "@/components/administration/admin-section";
import type { CompanyWithAccounts, MarketplaceAccountPublic } from "@/types/database";

type ConnectionRow = {
  company: CompanyWithAccounts;
  account: MarketplaceAccountPublic;
};

export function ConnectionsPanel() {
  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/companies");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const companies = (data.companies ?? []) as CompanyWithAccounts[];
      const next: ConnectionRow[] = [];
      for (const company of companies) {
        for (const account of company.accounts) {
          next.push({ company, account });
        }
      }
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function postJson(url: string, body?: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
    return data;
  }

  return (
    <AdminSection
      title="Marketplace Connections"
      description="All connections across companies. Open a company workspace to connect new accounts."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/administration/companies"
          className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Manage Companies
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
        >
          Refresh
        </button>
      </div>

      {message ? (
        <p className="mb-3 text-sm text-muted-foreground">{message}</p>
      ) : null}
      {error ? (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading connections…</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map(({ company, account }) => (
            <div key={account.id} className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Company:{" "}
                <Link
                  href={`/administration/companies/${company.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {company.name}
                </Link>
              </p>
              <MarketplaceConnectionCard
                account={account}
                onTest={async (accountId) => {
                  const data = await postJson(
                    `/api/marketplace-accounts/${accountId}?action=test`
                  );
                  return {
                    healthy: Boolean(
                      (data as { healthy?: boolean }).healthy ?? (data as { ok?: boolean }).ok
                    ),
                    latencyMs: (data as { latencyMs?: number | null }).latencyMs ?? null,
                    testedAt:
                      (data as { testedAt?: string }).testedAt ?? new Date().toISOString(),
                    failureReason:
                      (data as { failureReason?: string | null }).failureReason ?? null,
                  };
                }}
                onReconnect={() => {
                  window.location.href = `/administration/companies/${company.id}`;
                }}
                onDisconnect={async (accountId) => {
                  const res = await fetch(`/api/marketplace-accounts/${accountId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_active: false, sync_enabled: false }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? "Disconnect failed");
                  setMessage("Disconnected.");
                  await load();
                }}
                onHistoricalBackfill={async (accountId) => {
                  await postJson("/api/warehouse/historical-backfill", {
                    marketplaceAccountId: accountId,
                    trigger: "manual",
                  });
                  setMessage("Historical backfill triggered.");
                }}
                onIncrementalSync={async (accountId) => {
                  await postJson("/api/warehouse/incremental-sync", {
                    marketplaceAccountId: accountId,
                    trigger: "manual",
                  });
                  setMessage("Incremental sync triggered.");
                }}
              />
            </div>
          ))}
          <ComingSoonPlatformCard name="Ozon" />
          <ComingSoonPlatformCard name="Lamoda" />
          <ComingSoonPlatformCard name="Shopify" />
          {!rows.length ? (
            <p className="text-sm text-muted-foreground lg:col-span-2">
              No connections yet. Open a company workspace to connect Wildberries.
            </p>
          ) : null}
        </div>
      )}
    </AdminSection>
  );
}
