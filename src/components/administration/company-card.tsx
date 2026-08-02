"use client";

import Link from "next/link";
import type { CompanyWithAccounts } from "@/types/database";
import {
  latestSuccessfulSyncAt,
  resolveCompanyWarehouseHealth,
} from "@/lib/administration/connection-status";

const HEALTH_LABEL = {
  healthy: "Healthy",
  warning: "Warning",
  failed: "Failed",
  syncing: "Syncing",
  unknown: "—",
} as const;

type CompanyCardProps = {
  company: CompanyWithAccounts;
  onEdit: (company: CompanyWithAccounts) => void;
  onArchive: (company: CompanyWithAccounts) => void;
  busy?: boolean;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

export function CompanyCard({ company, onEdit, onArchive, busy }: CompanyCardProps) {
  const activeConnections = company.accounts.filter((a) => a.is_active).length;
  const health = resolveCompanyWarehouseHealth(company.accounts);
  const lastSync = latestSuccessfulSyncAt(company.accounts);

  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">{company.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {company.currency}
            {company.country ? ` · ${company.country}` : ""}
            {company.is_default ? " · Default" : ""}
          </p>
        </div>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {company.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Marketplaces</dt>
          <dd className="mt-0.5 font-medium">{company.accounts.length}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Active</dt>
          <dd className="mt-0.5 font-medium">{activeConnections}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Warehouse</dt>
          <dd className="mt-0.5 font-medium">{HEALTH_LABEL[health]}</dd>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Last Sync</dt>
          <dd className="mt-0.5 text-xs text-muted-foreground">{formatWhen(lastSync)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/administration/companies/${company.id}`}
          className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-ui hover:opacity-90"
        >
          Open Workspace
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(company)}
          className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium transition-ui hover:bg-card-hover disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={busy || company.status === "archived"}
          onClick={() => onArchive(company)}
          className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-ui hover:bg-card-hover disabled:opacity-50"
        >
          Archive
        </button>
      </div>
    </article>
  );
}
