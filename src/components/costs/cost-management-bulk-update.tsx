"use client";

import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { useRef, useState } from "react";
import { useScopeQueryString } from "@/hooks/use-scope-query";
import type { PurchaseCurrency } from "@/types/database";
import { PURCHASE_CURRENCIES } from "@/types/database";

type CostManagementBulkUpdateProps = {
  productCount: number;
  onImportComplete?: () => void;
};

type ImportHeaderState = {
  currency: PurchaseCurrency;
  exchange_rate: string;
};

const defaultHeader = (): ImportHeaderState => ({
  currency: "USD",
  exchange_rate: "",
});

export function CostManagementBulkUpdate({
  productCount,
  onImportComplete,
}: CostManagementBulkUpdateProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [header, setHeader] = useState<ImportHeaderState>(defaultHeader);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scopeQuery = useScopeQueryString();

  function resetFeedback() {
    setMessage(null);
    setError(null);
  }

  async function handleExport() {
    resetFeedback();
    setExporting(true);

    try {
      const url = scopeQuery ? `/api/costs/template?${scopeQuery}` : "/api/costs/template";
      const response = await fetch(url);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ?? `Cost_Management_${new Date().toISOString().split("T")[0]}.xlsx`;

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);

      setMessage(`Exported ${productCount} products (Supplier Article · Unit Cost)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    resetFeedback();
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadUrl = scopeQuery ? `/api/costs/upload?${scopeQuery}` : "/api/costs/upload";
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Upload failed");
      }

      const errorCount = (data.errors ?? []).length;
      setMessage(
        [
          `Products Updated: ${data.inserted ?? 0}`,
          `Skipped (unchanged): ${data.skippedUnchanged ?? 0}`,
          `Skipped (blank): ${data.skippedBlank ?? 0}`,
          `Errors: ${errorCount}`,
        ].join(" · ")
      );

      if (errorCount > 0) {
        const fullLog = (data.errors as { row: number; message: string }[])
          .map((item) => `Row ${item.row}: ${item.message}`)
          .join("\n");
        console.error("[cost-import] row errors:\n" + fullLog);
        setError(fullLog);
      }

      onImportComplete?.();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      console.error("[cost-import] upload failed", { error: message });
      setError(message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Bulk Update</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Export current products, edit unit costs in Excel, and import to update cost history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || uploading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-card-hover disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export Current Products"}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {uploading ? "Importing…" : "Import Excel"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Currency</span>
          <select
            value={header.currency}
            onChange={(event) => {
              const currency = event.target.value as PurchaseCurrency;
              setHeader((current) => ({
                ...current,
                currency,
                exchange_rate: currency === "RUB" ? "" : current.exchange_rate,
              }));
            }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2"
          >
            {PURCHASE_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>

        {header.currency !== "RUB" && (
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Exchange Rate</span>
            <input
              type="number"
              min="0.000001"
              step="0.000001"
              value={header.exchange_rate}
              onChange={(event) =>
                setHeader((current) => ({ ...current, exchange_rate: event.target.value }))
              }
              placeholder="Optional"
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            />
          </label>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Excel columns: Supplier Article · Unit Cost. Import updates product cost history only — no
        purchase records are created.
      </p>

      {(message || error) && (
        <div className="mt-4 space-y-1">
          {message && <p className="text-sm text-success whitespace-pre-wrap">{message}</p>}
          {error && <p className="text-sm text-danger whitespace-pre-wrap">{error}</p>}
        </div>
      )}
    </div>
  );
}
