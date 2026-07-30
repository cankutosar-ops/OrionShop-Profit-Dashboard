"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { VerificationDetailPanel } from "@/components/monitoring/verification-detail-panel";
import { VerificationHistoryPanel } from "@/components/monitoring/verification-history-panel";

export function VerificationAuditSection() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runManual() {
    if (!accountId) return;
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/monitoring/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplaceAccountId: accountId, syncStatus: "manual" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      setSelectedId(data.report?.id ?? null);
      setMessage(`Verification saved · ${data.report?.overall_result ?? "OK"}`);
      // Force history reload by soft navigation of selection; history panel depends on accountId only —
      // bump via location reload of query is heavy; instead remount via key on parent.
      window.dispatchEvent(new Event("verification-history-refresh"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-8" key={`${accountId}-${message ?? "idle"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Automated Verification Audit</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Immutable post-sync snapshots. Generated automatically after each completed sync; manual
            run available for diagnostics.
          </p>
        </div>
        <button
          type="button"
          disabled={!accountId || running}
          onClick={() => void runManual()}
          className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          {running ? "Verifying…" : "Run Verification Now"}
        </button>
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      <VerificationHistoryPanel selectedId={selectedId} onSelect={setSelectedId} />
      <VerificationDetailPanel reportId={selectedId} />
    </div>
  );
}
