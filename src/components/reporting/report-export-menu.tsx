"use client";

import { useState, useTransition } from "react";
import type { ReportExportFormat } from "@/lib/reporting/module/export-types";
import {
  defaultReportExporter,
  exportMimeType,
} from "@/lib/reporting/module/export-types";
import type { ReportExportDocument } from "@/lib/reporting/module/export/export-document";

type ReportExportMenuProps = {
  reportId: string;
  /** Canonical export document (title, columns, rows, summary, filters). */
  payload: ReportExportDocument;
  fileName?: string;
};

const FORMATS: { format: ReportExportFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "csv", label: "CSV" },
  { format: "pdf", label: "PDF" },
];

function downloadBytes(bytes: Uint8Array, fileName: string, mime: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Shared export control — all reports use the same Export Manager.
 */
export function ReportExportMenu({
  reportId,
  payload,
  fileName,
}: ReportExportMenuProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onExport = (format: ReportExportFormat) => {
    startTransition(async () => {
      setMessage(null);
      const result = await defaultReportExporter.export({
        reportId,
        format,
        payload,
        fileName,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      downloadBytes(result.bytes, result.fileName, exportMimeType(result.format));
      setMessage(`Downloaded ${result.fileName}`);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Export
      </span>
      {FORMATS.map(({ format, label }) => (
        <button
          key={format}
          type="button"
          disabled={pending}
          onClick={() => onExport(format)}
          className="rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-card-hover disabled:opacity-60"
        >
          {label}
        </button>
      ))}
      {message && (
        <span className="text-xs text-muted-foreground" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
