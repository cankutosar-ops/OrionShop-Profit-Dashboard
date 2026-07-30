"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { DASHBOARD_SYNC_COMPLETE_EVENT } from "@/lib/dashboard-auto-sync-session";
import {
  DASHBOARD_HEADER_POPUP_OPEN_EVENT,
  notifyDashboardHeaderPopupOpen,
} from "@/lib/dashboard-header-popup";
import type { SyncVerificationReport } from "@/lib/sync-verification/types";

/**
 * Sprint 9.1 — expandable Verification panel next to Sync.
 * Reports only. Never triggers sync, retry, repair, or backfill.
 */
export function SyncVerificationPanel() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SyncVerificationReport | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onSyncComplete() {
      setRefreshKey((k) => k + 1);
    }
    window.addEventListener(DASHBOARD_SYNC_COMPLETE_EVENT, onSyncComplete);
    return () => window.removeEventListener(DASHBOARD_SYNC_COMPLETE_EVENT, onSyncComplete);
  }, []);

  const load = useCallback(async () => {
    if (!accountId) {
      setReport(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sync/verification?marketplaceAccountId=${encodeURIComponent(accountId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Verification failed");
      }
      setReport(data as SyncVerificationReport);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function handleSiblingPopup(event: Event) {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;
      if (source && source !== "verification") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener(DASHBOARD_HEADER_POPUP_OPEN_EVENT, handleSiblingPopup);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener(DASHBOARD_HEADER_POPUP_OPEN_EVENT, handleSiblingPopup);
    };
  }, [open]);

  if (!accountId) return null;

  const overall = report?.overall;
  const badge =
    error != null
      ? "Error"
      : loading && !report
        ? "…"
        : overall === "warning"
          ? "Warning"
          : overall === "healthy"
            ? "Healthy"
            : "—";

  const badgeClass =
    error != null || overall === "warning"
      ? "text-amber-700 dark:text-amber-400"
      : overall === "healthy"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-muted-foreground";

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) notifyDashboardHeaderPopupOpen("verification");
      return next;
    });
  }

  return (
    <div ref={containerRef} className="relative inline-flex h-9 items-center">
      <button
        type="button"
        onClick={toggleOpen}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-background px-3 text-xs font-medium text-foreground/90 transition-colors hover:bg-muted/50"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Sync verification (read-only)"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Verification</span>
        <span className={`tabular-nums ${badgeClass}`}>{badge}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sync verification"
          className="absolute right-0 top-full z-50 mt-1 w-[22rem] rounded-lg border border-border/70 bg-background p-3 shadow-md"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Database up to date?
            </p>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="text-[11px] text-primary hover:underline disabled:opacity-50"
            >
              {loading ? "Checking…" : "Refresh"}
            </button>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          {report && (
            <div className="max-h-80 space-y-3 overflow-y-auto text-xs leading-relaxed">
              {report.sources.map((source) => (
                <div key={source.source} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <p className="font-medium text-foreground">{source.label}</p>
                  <p className="text-muted-foreground">
                    DB Range:{" "}
                    {source.earliestDate && source.latestDate
                      ? `${source.earliestDate} → ${source.latestDate}`
                      : "(no data)"}
                  </p>
                  <p className="text-muted-foreground">Records: {source.recordCount}</p>
                  {source.status === "healthy" ? (
                    <p className="text-emerald-700 dark:text-emerald-400">Healthy</p>
                  ) : (
                    <p className="text-amber-700 dark:text-amber-400">
                      Warning: {source.warning ?? "Check data freshness."}
                    </p>
                  )}
                </div>
              ))}
              <div className="pt-1">
                <p className="font-medium text-foreground">Overall</p>
                <p
                  className={
                    overall === "healthy"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400"
                  }
                >
                  {overall === "healthy" ? "Verification Healthy" : "Verification Warning"}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Expected as of {report.expectedAsOf}
                  {report.lastSuccessfulSyncAt
                    ? ` · last successful sync ${new Date(report.lastSuccessfulSyncAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
            </div>
          )}

          {!report && !error && loading && (
            <p className="text-xs text-muted-foreground">Reading database extents…</p>
          )}
        </div>
      )}
    </div>
  );
}
