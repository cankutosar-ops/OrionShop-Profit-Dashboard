"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { DASHBOARD_SYNC_COMPLETE_EVENT } from "@/lib/dashboard-auto-sync-session";
import {
  DASHBOARD_HEADER_POPUP_OPEN_EVENT,
  notifyDashboardHeaderPopupOpen,
} from "@/lib/dashboard-header-popup";
import {
  freshnessItems,
  type FreshnessItem,
  type FreshnessSnapshot,
  type FreshnessStatus,
} from "@/lib/data-freshness";

/**
 * Compact, read-only status for persisted Dashboard source freshness.
 * Never triggers sync, retry, repair, or backfill.
 */
export function SyncVerificationPanel() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account");
  const through = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FreshnessSnapshot | null>(null);
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
      setSnapshot(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/data-freshness?account=${encodeURIComponent(accountId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Data status is unavailable");
      }
      setSnapshot(data as FreshnessSnapshot);
    } catch (err) {
      setSnapshot(null);
      setError(err instanceof Error ? err.message : "Data status is unavailable");
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
      if (source && source !== "data-status") {
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

  const items = snapshot ? freshnessItems(snapshot, through) : [];
  const warningCount = items.filter((item) => item.status !== "CURRENT").length;
  const summary = error
    ? "unavailable"
    : loading && !snapshot
      ? "…"
      : snapshot && warningCount === 0
        ? "✓"
        : snapshot
          ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
          : "—";
  const summaryClass = error || warningCount > 0
    ? "text-amber-700 dark:text-amber-400"
    : snapshot
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-muted-foreground";

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) notifyDashboardHeaderPopupOpen("data-status");
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
        title="Data freshness status (read-only)"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Data Status</span>
        <span className={`tabular-nums ${summaryClass}`}>{summary}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Data freshness details"
          className="absolute right-0 top-full z-50 mt-1 w-[calc(100vw-1.5rem)] max-w-[22rem] rounded-lg border border-border/70 bg-background p-3 shadow-md sm:w-[22rem]"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Data freshness
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

          {snapshot && (
            <div className="max-h-[min(24rem,70vh)] space-y-3 overflow-y-auto text-xs leading-relaxed">
              {items.map((item) => (
                <FreshnessRow key={item.label} item={item} />
              ))}
              <div className="pt-1">
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Expected through {through}
                  {snapshot.lastSuccessfulSync
                    ? ` · last successful account sync ${new Date(snapshot.lastSuccessfulSync).toLocaleString()}`
                    : ""}
                </p>
              </div>
            </div>
          )}

          {!snapshot && !error && loading && (
            <p className="text-xs text-muted-foreground">Reading stored source dates…</p>
          )}
        </div>
      )}
    </div>
  );
}

function FreshnessRow({ item }: { item: FreshnessItem }) {
  return (
    <div className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground">{item.label}</p>
        <span className={`text-[10px] font-semibold ${statusClass(item.status)}`}>
          {displayStatus(item.status)}
        </span>
      </div>
      <p className="text-muted-foreground">
        Latest stored date: {item.latestDate ?? "none"}
      </p>
      <p className="text-muted-foreground">{item.detail}</p>
    </div>
  );
}

function displayStatus(status: FreshnessStatus) {
  return status === "AWAITING PUBLICATION" ? "AWAITING_WB_PUBLICATION" : status;
}

function statusClass(status: FreshnessStatus) {
  if (status === "CURRENT") return "text-emerald-700 dark:text-emerald-400";
  if (status === "INCOMPLETE") return "text-danger";
  return "text-amber-700 dark:text-amber-400";
}
