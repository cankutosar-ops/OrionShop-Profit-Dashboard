"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { FILTER_PARAMS } from "@/lib/filter-params";
import { cn } from "@/lib/utils";

type ExportBusinessReportButtonProps = {
  className?: string;
};

/**
 * Temporary Sprint 7.1 action — downloads Business Report for the current scope.
 * No report configuration screen.
 */
export function ExportBusinessReportButton({
  className,
}: ExportBusinessReportButtonProps) {
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set("templateId", "business-report");
      for (const key of Object.values(FILTER_PARAMS)) {
        const value = searchParams.get(key);
        if (value) query.set(key, value);
      }

      const response = await fetch(`/api/reports/generate?${query.toString()}`);
      if (response.status === 422) {
        const body = (await response.json()) as { message?: string };
        setError(body.message ?? "No data for the selected period.");
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `Export failed (${response.status})`);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? "Business_Report.xlsx";

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleExport}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium transition-colors",
          busy
            ? "cursor-not-allowed opacity-50"
            : "hover:bg-card-hover hover:text-foreground"
        )}
        aria-label="Export Business Report Excel"
      >
        <Download className="h-4 w-4" />
        {busy ? "Generating…" : "Export Business Report"}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
