"use client";

import { useCallback, useEffect, useState } from "react";
import { CompanyCard } from "@/components/administration/company-card";
import { AdminSection } from "@/components/administration/admin-section";
import type { CompanyWithAccounts } from "@/types/database";

type CompanyFormState = {
  name: string;
  country: string;
  currency: string;
  default_tax_percent: string;
};

const emptyForm: CompanyFormState = {
  name: "",
  country: "RU",
  currency: "RUB",
  default_tax_percent: "6",
};

export function CompanyListPanel() {
  const [companies, setCompanies] = useState<CompanyWithAccounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/companies");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load companies");
      setCompanies(data.companies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        country: form.country || null,
        currency: form.currency || "RUB",
        default_tax_percent: Number(form.default_tax_percent) || 6,
      };
      const res = await fetch(
        editingId ? `/api/companies/${editingId}` : "/api/companies",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminSection
      title="Companies"
      description="Root tenants of the Marketplace Operations Platform. Open a workspace to manage connections."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm);
            setShowForm(true);
          }}
        >
          Create Company
        </button>
        <button
          type="button"
          className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={saveCompany}
          className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-5"
        >
          <h3 className="text-sm font-semibold">
            {editingId ? "Edit Company" : "Create Company"}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              <span className="text-muted-foreground">Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Country</span>
              <input
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Default Currency</span>
              <input
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Default Tax (%)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={form.default_tax_percent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, default_tax_percent: e.target.value }))
                }
                className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading companies…</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {companies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              busy={busy}
              onEdit={(c) => {
                setEditingId(c.id);
                setForm({
                  name: c.name,
                  country: c.country ?? "",
                  currency: c.currency,
                  default_tax_percent: String(c.default_tax_percent ?? 6),
                });
                setShowForm(true);
              }}
              onArchive={async (c) => {
                if (!window.confirm(`Archive company “${c.name}”? Data is retained.`)) return;
                setBusy(true);
                try {
                  const res = await fetch(`/api/companies/${c.id}`, { method: "DELETE" });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? "Archive failed");
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Archive failed");
                } finally {
                  setBusy(false);
                }
              }}
            />
          ))}
          {!companies.length ? (
            <p className="text-sm text-muted-foreground">No companies yet. Create one to begin.</p>
          ) : null}
        </div>
      )}
    </AdminSection>
  );
}
