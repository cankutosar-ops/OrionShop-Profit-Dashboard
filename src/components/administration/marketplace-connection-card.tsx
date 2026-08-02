"use client";

import Link from "next/link";
import { useState } from "react";
import { ConnectionStatusBadge } from "@/components/administration/connection-status-badge";
import { resolveConnectionDisplayStatus } from "@/lib/administration/connection-status";
import type { MarketplaceAccountPublic } from "@/types/database";

const MARKETPLACE_LABEL: Record<string, string> = {
  wildberries: "Wildberries",
  ozon: "Ozon",
  lamoda: "Lamoda",
  shopify: "Shopify",
};

type TestResult = {
  healthy: boolean;
  latencyMs: number | null;
  testedAt: string;
  failureReason: string | null;
};

type MarketplaceConnectionCardProps = {
  account: MarketplaceAccountPublic;
  busy?: boolean;
  onTest: (accountId: string) => Promise<TestResult>;
  onReconnect: (account: MarketplaceAccountPublic) => void;
  onDisconnect: (accountId: string) => Promise<void>;
  onHistoricalBackfill: (accountId: string) => Promise<void>;
  onIncrementalSync: (accountId: string) => Promise<void>;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

export function MarketplaceConnectionCard({
  account,
  busy,
  onTest,
  onReconnect,
  onDisconnect,
  onHistoricalBackfill,
  onIncrementalSync,
}: MarketplaceConnectionCardProps) {
  const status = resolveConnectionDisplayStatus(account);
  const [test, setTest] = useState<TestResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const disabled = busy || localBusy;

  async function run(action: () => Promise<void>) {
    setActionError(null);
    setLocalBusy(true);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {MARKETPLACE_LABEL[account.marketplace] ?? account.marketplace}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{account.account_name}</p>
        </div>
        <ConnectionStatusBadge status={status} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Last Sync</dt>
          <dd className="mt-0.5">{formatWhen(account.last_successful_sync_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Default</dt>
          <dd className="mt-0.5">{account.is_default ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Credential</dt>
          <dd className="mt-0.5">{account.has_api_key ? "Configured" : "Missing"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sync Enabled</dt>
          <dd className="mt-0.5">{account.sync_enabled ? "Yes" : "No"}</dd>
        </div>
      </dl>

      {test ? (
        <div className="mt-3 rounded-xl border border-border/80 bg-background px-3 py-2 text-xs">
          <p className="font-medium">{test.healthy ? "Healthy" : "Unhealthy"}</p>
          <p className="mt-1 text-muted-foreground">
            Latency: {test.latencyMs != null ? `${test.latencyMs} ms` : "—"}
          </p>
          <p className="text-muted-foreground">Last Successful Test: {formatWhen(test.healthy ? test.testedAt : null)}</p>
          {test.failureReason ? (
            <p className="mt-1 text-red-600 dark:text-red-400">Failure: {test.failureReason}</p>
          ) : null}
        </div>
      ) : null}

      {actionError ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-card-hover disabled:opacity-50"
          onClick={() =>
            run(async () => {
              const result = await onTest(account.id);
              setTest(result);
            })
          }
        >
          Test Connection
        </button>
        <button
          type="button"
          disabled={disabled}
          className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-card-hover disabled:opacity-50"
          onClick={() => onReconnect(account)}
        >
          Reconnect
        </button>
        <button
          type="button"
          disabled={disabled || !account.is_active}
          className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-card-hover disabled:opacity-50"
          onClick={() => run(() => onDisconnect(account.id))}
        >
          Disconnect
        </button>
        <Link
          href={`/administration/warehouse?marketplaceAccountId=${account.id}`}
          className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-card-hover"
        >
          View Warehouse Status
        </Link>
        <button
          type="button"
          disabled={disabled}
          className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-card-hover disabled:opacity-50"
          onClick={() => run(() => onHistoricalBackfill(account.id))}
        >
          Trigger Historical Backfill
        </button>
        <button
          type="button"
          disabled={disabled}
          className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-card-hover disabled:opacity-50"
          onClick={() => run(() => onIncrementalSync(account.id))}
        >
          Trigger Incremental Sync
        </button>
      </div>
    </article>
  );
}

type ComingSoonPlatformCardProps = {
  name: string;
};

export function ComingSoonPlatformCard({ name }: ComingSoonPlatformCardProps) {
  return (
    <article className="rounded-2xl border border-dashed border-border bg-card/50 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-foreground">{name}</h3>
      <p className="mt-2 text-xs text-muted-foreground">Coming Soon</p>
      <ConnectionStatusBadge status="disconnected" className="mt-3" />
    </article>
  );
}
