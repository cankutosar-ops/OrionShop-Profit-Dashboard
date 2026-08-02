"use client";

import { useCallback, useEffect, useState } from "react";
import { CompanyWorkspace } from "@/components/administration/company-workspace";
import type { CompanyWithAccounts, MarketplaceAccountPublic } from "@/types/database";

type CompanyWorkspacePanelProps = {
  companyId: string;
};

type ConnectForm = {
  account_name: string;
  api_key: string;
  seller_id: string;
};

const emptyConnect: ConnectForm = {
  account_name: "",
  api_key: "",
  seller_id: "",
};

export function CompanyWorkspacePanel({ companyId }: CompanyWorkspacePanelProps) {
  const [company, setCompany] = useState<CompanyWithAccounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [reconnectId, setReconnectId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    country: "",
    currency: "",
    default_tax_percent: "6",
  });
  const [connectForm, setConnectForm] = useState<ConnectForm>(emptyConnect);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load company");
      const c = data.company as CompanyWithAccounts;
      setCompany(c);
      setEditForm({
        name: c.name,
        country: c.country ?? "",
        currency: c.currency,
        default_tax_percent: String(c.default_tax_percent ?? 6),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load company");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          country: editForm.country || null,
          currency: editForm.currency,
          default_tax_percent: Number(editForm.default_tax_percent) || 6,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setEditOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveConnect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (reconnectId) {
        const res = await fetch(`/api/marketplace-accounts/${reconnectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_name: connectForm.account_name,
            api_key: connectForm.api_key || undefined,
            seller_id: connectForm.seller_id || null,
            is_active: true,
            sync_enabled: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Reconnect failed");
      } else {
        const res = await fetch("/api/marketplace-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: companyId,
            marketplace: "wildberries",
            account_name: connectForm.account_name,
            api_key: connectForm.api_key,
            seller_id: connectForm.seller_id || null,
            is_active: true,
            sync_enabled: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Connect failed");
      }
      setConnectOpen(false);
      setReconnectId(null);
      setConnectForm(emptyConnect);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  function openReconnect(account: MarketplaceAccountPublic) {
    setReconnectId(account.id);
    setConnectForm({
      account_name: account.account_name,
      api_key: "",
      seller_id: account.seller_id ?? "",
    });
    setConnectOpen(true);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading workspace…</p>;
  }

  if (!company) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        {error ?? "Company not found"}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {editOpen ? (
        <form
          onSubmit={saveEdit}
          className="rounded-2xl border border-border bg-card p-4 sm:p-5"
        >
          <h3 className="text-sm font-semibold">Edit Company Information</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["name", "Name"],
                ["country", "Country"],
                ["currency", "Default Currency"],
                ["default_tax_percent", "Default Tax (%)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs">
                <span className="text-muted-foreground">{label}</span>
                <input
                  required={key === "name"}
                  value={editForm[key]}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {connectOpen ? (
        <form
          onSubmit={saveConnect}
          className="rounded-2xl border border-border bg-card p-4 sm:p-5"
        >
          <h3 className="text-sm font-semibold">
            {reconnectId ? "Reconnect Wildberries" : "Connect Wildberries"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            API key is write-only and never displayed after save.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs sm:col-span-2">
              <span className="text-muted-foreground">Account Name</span>
              <input
                required
                value={connectForm.account_name}
                onChange={(e) =>
                  setConnectForm((f) => ({ ...f, account_name: e.target.value }))
                }
                className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs sm:col-span-2">
              <span className="text-muted-foreground">
                API Key {reconnectId ? "(leave blank to keep existing)" : ""}
              </span>
              <input
                required={!reconnectId}
                type="password"
                autoComplete="off"
                value={connectForm.api_key}
                onChange={(e) =>
                  setConnectForm((f) => ({ ...f, api_key: e.target.value }))
                }
                className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Seller ID (optional)</span>
              <input
                value={connectForm.seller_id}
                onChange={(e) =>
                  setConnectForm((f) => ({ ...f, seller_id: e.target.value }))
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
              {busy ? "Saving…" : reconnectId ? "Reconnect" : "Connect"}
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
              onClick={() => {
                setConnectOpen(false);
                setReconnectId(null);
                setConnectForm(emptyConnect);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <CompanyWorkspace
        company={company}
        onRefresh={load}
        onEditCompany={() => setEditOpen(true)}
        onConnect={() => {
          setReconnectId(null);
          setConnectForm(emptyConnect);
          setConnectOpen(true);
        }}
        onReconnect={openReconnect}
      />
    </div>
  );
}
