"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { FILTER_PARAMS } from "@/lib/filter-params";
import { inferPeriodPreset } from "@/lib/reports/report-period";
import { cn } from "@/lib/utils";

type ExportReportButtonProps = {
  templateId: "business-report" | "product-report";
  className?: string;
  label?: string;
  variant?: "primary" | "secondary";
  ariaLabel?: string;
};

/**
 * Downloads a registered report template for the current dashboard scope.
 */
export function ExportReportButton({
  templateId,
  className,
  label = "Export Excel",
  variant = "primary",
  ariaLabel,
}: ExportReportButtonProps) {
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set("templateId", templateId);
      for (const key of Object.values(FILTER_PARAMS)) {
        const value = searchParams.get(key);
        if (value) query.set(key, value);
      }
      const from = searchParams.get(FILTER_PARAMS.from);
      const to = searchParams.get(FILTER_PARAMS.to);
      if (from && to) {
        query.set("periodPreset", inferPeriodPreset(from, to));
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
      const filename = match?.[1] ?? `${templateId}.xlsx`;

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
          "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
          variant === "primary"
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border border-border bg-background hover:bg-card-hover",
          busy && "cursor-not-allowed opacity-50"
        )}
        aria-label={ariaLabel ?? `Export ${templateId} Excel`}
      >
        <Download className="h-4 w-4" />
        {busy ? "Generating…" : label}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Back-compat wrapper for Business Report export. */
export function ExportBusinessReportButton(
  props: Omit<ExportReportButtonProps, "templateId">
) {
  return (
    <ExportReportButton
      {...props}
      templateId="business-report"
      ariaLabel="Export Business Report Excel"
    />
  );
}

export function ExportProductReportButton(
  props: Omit<ExportReportButtonProps, "templateId">
) {
  return (
    <ExportReportButton
      {...props}
      templateId="product-report"
      ariaLabel="Export Product Report Excel"
    />
  );
}
