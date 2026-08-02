"use client";

import { useCallback, useState } from "react";
import {
  Activity,
  Bell,
  CalendarClock,
  PlugZap,
  ScrollText,
  Warehouse,
} from "lucide-react";
import { MarketplaceConnectionCard, ComingSoonPlatformCard } from "@/components/administration/marketplace-connection-card";
import { QuickActionPanel } from "@/components/administration/quick-action-panel";
import { WorkspaceSummaryCard } from "@/components/administration/workspace-summary-card";
import {
  latestSuccessfulSyncAt,
  resolveCompanyWarehouseHealth,
} from "@/lib/administration/connection-status";
import type { CompanyWithAccounts, MarketplaceAccountPublic } from "@/types/database";

const HEALTH_LABEL = {
  healthy: "Healthy",
  warning: "Warning",
  failed: "Failed",
  syncing: "Syncing",
  unknown: "Unknown",
} as const;

type CompanyWorkspaceProps = {
  company: CompanyWithAccounts;
  onRefresh: () => Promise<void>;
  onEditCompany: () => void;
  onConnect: () => void;
  onReconnect: (account: MarketplaceAccountPublic) => void;
};

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

export function CompanyWorkspace({
  company,
  onRefresh,
  onEditCompany,
  onConnect,
  onReconnect,
}: CompanyWorkspaceProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const health = resolveCompanyWarehouseHealth(company.accounts);
  const lastSync = latestSuccessfulSyncAt(company.accounts);
  const active = company.accounts.filter((a) => a.is_active).length;

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }, [onRefresh]);

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}

      <WorkspaceSummaryCard
        title="Company Information"
        actions={
          <button
            type="button"
            onClick={onEditCompany}
            className="text-xs font-medium text-primary hover:underline"
          >
            Edit
          </button>
        }
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</dt>
            <dd className="mt-0.5 font-medium">{company.name}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Country</dt>
            <dd className="mt-0.5 font-medium">{company.country ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Default Currency</dt>
            <dd className="mt-0.5 font-medium">{company.currency}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Default Tax</dt>
            <dd className="mt-0.5 font-medium">{company.default_tax_percent}%</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Created</dt>
            <dd className="mt-0.5 font-medium">
              {company.created_at ? new Date(company.created_at).toLocaleDateString() : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</dt>
            <dd className="mt-0.5 font-medium capitalize">{company.status}</dd>
          </div>
        </dl>
      </WorkspaceSummaryCard>

      <WorkspaceSummaryCard
        title="Marketplace Connections"
        actions={
          <button
            type="button"
            onClick={onConnect}
            className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Connect Wildberries
          </button>
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {company.accounts.map((account) => (
            <MarketplaceConnectionCard
              key={account.id}
              account={account}
              busy={busy}
              onTest={async (accountId) => {
                const data = await postJson(
                  `/api/marketplace-accounts/${accountId}?action=test`
                );
                return {
                  healthy: Boolean((data as { healthy?: boolean }).healthy ?? (data as { ok?: boolean }).ok),
                  latencyMs: (data as { latencyMs?: number | null }).latencyMs ?? null,
                  testedAt: (data as { testedAt?: string }).testedAt ?? new Date().toISOString(),
                  failureReason: (data as { failureReason?: string | null }).failureReason ?? null,
                };
              }}
              onReconnect={onReconnect}
              onDisconnect={async (accountId) => {
                await withBusy(async () => {
                  await fetch(`/api/marketplace-accounts/${accountId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_active: false, sync_enabled: false }),
                  }).then(async (res) => {
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "Disconnect failed");
                  });
                  setMessage("Connection disconnected (inactive).");
                });
              }}
              onHistoricalBackfill={async (accountId) => {
                await withBusy(async () => {
                  await postJson("/api/warehouse/historical-backfill", {
                    marketplaceAccountId: accountId,
                    trigger: "manual",
                  });
                  setMessage("Historical backfill triggered.");
                });
              }}
              onIncrementalSync={async (accountId) => {
                await withBusy(async () => {
                  await postJson("/api/warehouse/incremental-sync", {
                    marketplaceAccountId: accountId,
                    trigger: "manual",
                  });
                  setMessage("Incremental sync triggered.");
                });
              }}
            />
          ))}
          <ComingSoonPlatformCard name="Ozon" />
          <ComingSoonPlatformCard name="Lamoda" />
          <ComingSoonPlatformCard name="Shopify" />
        </div>
      </WorkspaceSummaryCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <WorkspaceSummaryCard title="Warehouse Summary">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Health</dt>
              <dd className="mt-0.5 font-medium">{HEALTH_LABEL[health]}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Active Connections</dt>
              <dd className="mt-0.5 font-medium">{active}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Last Sync</dt>
              <dd className="mt-0.5 text-xs text-muted-foreground">
                {lastSync ? new Date(lastSync).toLocaleString() : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Monitoring controls arrive in Sprint 11.3. Status is derived from connection lifecycle only.
          </p>
        </WorkspaceSummaryCard>

        <WorkspaceSummaryCard title="Recent Operations">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {company.accounts.slice(0, 5).map((account) => (
              <li key={account.id} className="flex justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                <span className="truncate">{account.account_name}</span>
                <span className="shrink-0 text-xs">
                  {account.last_sync_status ?? "idle"}
                </span>
              </li>
            ))}
            {!company.accounts.length ? (
              <li>No marketplace operations yet. Connect Wildberries to begin.</li>
            ) : null}
          </ul>
        </WorkspaceSummaryCard>
      </div>

      <WorkspaceSummaryCard title="Quick Actions">
        <QuickActionPanel
          actions={[
            {
              label: "Run Connection Test",
              icon: PlugZap,
              disabled: !company.accounts[0] || busy,
              onClick: () => {
                const first = company.accounts.find((a) => a.is_active) ?? company.accounts[0];
                if (!first) return;
                void postJson(`/api/marketplace-accounts/${first.id}?action=test`).then(() =>
                  setMessage(`Connection test finished for ${first.account_name}.`)
                );
              },
            },
            {
              label: "Open Warehouse",
              href: "/administration/warehouse",
              icon: Warehouse,
            },
            {
              label: "View Scheduler",
              href: "/administration/warehouse/scheduler",
              icon: CalendarClock,
            },
            {
              label: "View Alerts",
              href: "/administration/alerts",
              icon: Bell,
            },
            {
              label: "Open Audit Logs",
              href: "/administration/audit-logs",
              icon: ScrollText,
            },
            {
              label: "System Health",
              href: "/administration/system-health",
              icon: Activity,
            },
          ]}
        />
      </WorkspaceSummaryCard>
    </div>
  );
}
