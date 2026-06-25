"use client";

import { useRouter } from "next/navigation";
import { FileSpreadsheet, Pencil, Plus, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { CostRecord, ProductOption } from "@/types/database";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type CostsManagerProps = {
  costs: CostRecord[];
  products: ProductOption[];
};

type CostFormState = {
  supplier_article: string;
  cost: string;
  effective_from: string;
};

const emptyForm = (): CostFormState => ({
  supplier_article: "",
  cost: "",
  effective_from: new Date().toISOString().split("T")[0],
});

export function CostsManager({ costs, products }: CostsManagerProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CostFormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editingRecord = useMemo(
    () => costs.find((cost) => cost.id === editingId) ?? null,
    [costs, editingId]
  );

  const filteredCosts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return costs;
    return costs.filter(
      (record) =>
        record.supplier_article.toLowerCase().includes(query) ||
        record.product_name.toLowerCase().includes(query)
    );
  }, [costs, search]);

  const knownArticles = useMemo(
    () => products.map((product) => product.supplier_article),
    [products]
  );

  function resetFeedback() {
    setMessage(null);
    setError(null);
  }

  function openAddForm() {
    resetFeedback();
    setEditingId(null);
    setForm(emptyForm());
    setShowAddForm(true);
  }

  function openUpdateForm(record: CostRecord) {
    resetFeedback();
    setShowAddForm(false);
    setEditingId(record.id);
    setForm({
      supplier_article: record.supplier_article,
      cost: String(record.cost),
      effective_from: new Date().toISOString().split("T")[0],
    });
  }

  function closeForms() {
    setShowAddForm(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    resetFeedback();
    setLoading(true);

    const payload = {
      supplier_article: form.supplier_article.trim(),
      cost: Number(form.cost),
      effective_from: form.effective_from,
    };

    try {
      const response = await fetch(
        editingId ? `/api/costs/${editingId}` : "/api/costs",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save cost");
      }

      setMessage(
        editingId
          ? "New cost history row added — previous costs preserved"
          : "Cost added"
      );
      closeForms();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cost");
    } finally {
      setLoading(false);
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

      const response = await fetch("/api/costs/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Upload failed");
      }

      const errorCount = (data.errors ?? []).length;
      setMessage(
        errorCount > 0
          ? `Imported ${data.inserted} history rows · ${errorCount} errors`
          : `Imported ${data.inserted} history rows`
      );

      if (errorCount > 0) {
        const preview = (data.errors as { row: number; message: string }[])
          .slice(0, 3)
          .map((item) => `Row ${item.row}: ${item.message}`)
          .join(" · ");
        setError(preview);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  const formVisible = showAddForm || editingId !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by article or product name…"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
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
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-card-hover disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {uploading ? "Importing…" : "Import Excel"}
          </button>
          <button
            type="button"
            onClick={openAddForm}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Cost
          </button>
        </div>
      </div>

      {(message || error) && (
        <div className="space-y-1">
          {message && <p className="text-sm text-success">{message}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      {formVisible && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">
                {editingId ? "Update Cost" : "Add Cost"}
              </h3>
              {editingId && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Saves a new history row — previous costs are kept unchanged.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={closeForms}
              className="rounded-lg p-1 text-muted-foreground hover:bg-card-hover hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Supplier Article</span>
              {editingId ? (
                <input
                  type="text"
                  value={editingRecord?.supplier_article ?? form.supplier_article}
                  disabled
                  className="w-full rounded-xl border border-border bg-card-hover px-3 py-2 font-mono text-muted-foreground"
                />
              ) : (
                <>
                  <input
                    required
                    list="supplier-articles"
                    value={form.supplier_article}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        supplier_article: event.target.value,
                      }))
                    }
                    placeholder="e.g. ART-001"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono"
                  />
                  <datalist id="supplier-articles">
                    {knownArticles.map((article) => (
                      <option key={article} value={article} />
                    ))}
                  </datalist>
                </>
              )}
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">
                {editingId ? "New Active Cost" : "Cost"}
              </span>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(event) =>
                  setForm((current) => ({ ...current, cost: event.target.value }))
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Effective From</span>
              <input
                required
                type="date"
                value={form.effective_from}
                onChange={(event) =>
                  setForm((current) => ({ ...current, effective_from: event.target.value }))
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>

            <div className="flex justify-end gap-2 sm:col-span-3">
              <button
                type="button"
                onClick={closeForms}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-card-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Saving…" : editingId ? "Save New Cost" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <p className="text-sm text-muted-foreground">
            {filteredCosts.length} of {costs.length} products with active costs
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">Supplier Article</th>
                <th className="px-6 py-3 font-medium">Product Name</th>
                <th className="px-6 py-3 font-medium">Active Cost</th>
                <th className="px-6 py-3 font-medium">Last Updated</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCosts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    {costs.length === 0
                      ? "No cost records yet."
                      : "No records match your search."}
                  </td>
                </tr>
              ) : (
                filteredCosts.map((record) => (
                  <tr
                    key={record.id}
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-card-hover",
                      editingId === record.id && "bg-primary/5"
                    )}
                  >
                    <td className="px-6 py-3.5 font-mono text-xs font-medium text-primary">
                      {record.supplier_article}
                    </td>
                    <td className="px-6 py-3.5">{record.product_name}</td>
                    <td className="px-6 py-3.5 font-medium">{formatCurrency(record.cost)}</td>
                    <td className="px-6 py-3.5 text-muted-foreground">
                      {formatDate(record.last_updated)}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openUpdateForm(record)}
                          disabled={loading}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-card-hover disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Update Cost
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
