"use client";

import { useEffect, useState } from "react";
import { HealthBadge } from "@/components/monitoring/health-badge";

type DetailPayload = {
  id: string;
  verifiedAt: string;
  marketplaceAccountId: string;
  healthScore: number;
  overallResult: string;
  schemaStatus: string;
  snapshot: {
    orders: EntityBlock;
    sales: EntityBlock;
    finance: EntityBlock;
    inventory: EntityBlock;
    synchronization: {
      durationMs: number | null;
      rowsInserted: number;
      rowsUpdated: number;
      errors: string[];
      warnings: string[];
      finalStatus: string;
    };
    operationalAlerts: Array<{ severity: string; title: string; detail: string }>;
    failures: Array<{
      category: string;
      affectedEntity: string;
      reason: string;
      detectedAt: string;
      recommendedAction: string;
    }>;
  };
};

type EntityBlock = {
  latestApiDate: string | null;
  latestDbDate: string | null;
  gapDays: number | null;
  status: string;
};

export function VerificationDetailPanel({ reportId }: { reportId: string | null }) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const res = await fetch(`/api/monitoring/verification-history/${reportId}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load report");
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load report");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (!reportId) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Select a verification run to view immutable details, failure analysis, and export actions.
      </section>
    );
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!detail) return <p className="text-sm text-muted-foreground">Loading verification details…</p>;

  const entities = [
    ["Orders", detail.snapshot.orders],
    ["Sales", detail.snapshot.sales],
    ["Finance", detail.snapshot.finance],
    ["Inventory", detail.snapshot.inventory],
  ] as const;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Verification Details</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(detail.verifiedAt).toLocaleString()} · account {detail.marketplaceAccountId}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HealthBadge status={detail.overallResult} />
          <a
            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted/50"
            href={`/api/monitoring/verification-history/${detail.id}?format=json`}
          >
            JSON
          </a>
          <a
            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted/50"
            href={`/api/monitoring/verification-history/${detail.id}?format=csv`}
          >
            CSV
          </a>
          <a
            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted/50"
            href={`/api/monitoring/verification-history/${detail.id}?format=pdf`}
          >
            PDF
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {entities.map(([label, block]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">{label}</p>
              <HealthBadge status={block.status} />
            </div>
            <p className="mt-2 text-muted-foreground">API: {block.latestApiDate ?? "—"}</p>
            <p className="text-muted-foreground">DB: {block.latestDbDate ?? "—"}</p>
            <p className="text-muted-foreground">Gap: {block.gapDays ?? "—"} days</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="font-medium text-foreground">Synchronization</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Status {detail.snapshot.synchronization.finalStatus} · inserted{" "}
          {detail.snapshot.synchronization.rowsInserted} · updated{" "}
          {detail.snapshot.synchronization.rowsUpdated} · duration{" "}
          {detail.snapshot.synchronization.durationMs ?? "—"} ms
        </p>
        {detail.snapshot.synchronization.errors.length ? (
          <p className="mt-2 text-xs text-danger">
            {detail.snapshot.synchronization.errors.slice(0, 5).join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Failure Analysis</p>
        {detail.snapshot.failures.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No classified failures.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {detail.snapshot.failures.map((f, idx) => (
              <li key={`${f.category}-${idx}`} className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                <p className="font-medium text-foreground">
                  [{f.category}] {f.affectedEntity}
                </p>
                <p className="text-muted-foreground">{f.reason}</p>
                <p className="mt-1 text-muted-foreground">Recommended: {f.recommendedAction}</p>
                <p className="text-[10px] text-muted-foreground">
                  Detected {new Date(f.detectedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
