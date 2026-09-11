"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/administration/admin-section";
import { AuditLogTable } from "@/components/administration/audit-log-table";
import type { AuditEventRow } from "@/lib/administration/audit-types";

type Filters = {
  search: string;
  module: string;
  result: string;
  dateFrom: string;
  dateTo: string;
};

const emptyFilters: Filters = {
  search: "",
  module: "",
  result: "",
  dateFrom: "",
  dateTo: "",
};

export function AuditLogsPanel() {
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view: "audit" });
      if (next.search.trim()) params.set("search", next.search.trim());
      if (next.module.trim()) params.set("module", next.module.trim());
      if (next.result.trim()) params.set("result", next.result.trim());
      if (next.dateFrom) params.set("dateFrom", new Date(next.dateFrom).toISOString());
      if (next.dateTo) {
        const end = new Date(next.dateTo);
        end.setHours(23, 59, 59, 999);
        params.set("dateTo", end.toISOString());
      }
      const res = await fetch(`/api/administration/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load audit logs");
      setEvents(data.events ?? []);
      setAvailable(data.available !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  return (
    <AdminSection
      title="Audit Logs"
      description="Read-only administrative and security activity. Search, filter, and date range supported. Reason captures operator explanations; Correlation ID groups related operations."
    >
      <form
        className="mb-4 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters(draft);
        }}
      >
        <label className="text-xs lg:col-span-2">
          <span className="text-muted-foreground">Search</span>
          <input
            value={draft.search}
            onChange={(e) => setDraft((f) => ({ ...f, search: e.target.value }))}
            placeholder="User, company, module, action…"
            className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Module</span>
          <input
            value={draft.module}
            onChange={(e) => setDraft((f) => ({ ...f, module: e.target.value }))}
            placeholder="users, security…"
            className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Result</span>
          <select
            value={draft.result}
            onChange={(e) => setDraft((f) => ({ ...f, result: e.target.value }))}
            className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="denied">Denied</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">From</span>
          <input
            type="date"
            value={draft.dateFrom}
            onChange={(e) => setDraft((f) => ({ ...f, dateFrom: e.target.value }))}
            className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">To</span>
          <input
            type="date"
            value={draft.dateTo}
            onChange={(e) => setDraft((f) => ({ ...f, dateTo: e.target.value }))}
            className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2 lg:col-span-5">
          <button
            type="submit"
            className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Apply filters
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
            onClick={() => {
              setDraft(emptyFilters);
              setFilters(emptyFilters);
            }}
          >
            Clear
          </button>
        </div>
      </form>

      {error ? (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading audit logs…</p>
      ) : (
        <AuditLogTable events={events} available={available} />
      )}
    </AdminSection>
  );
}
