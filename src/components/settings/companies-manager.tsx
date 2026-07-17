"use client";

import { Loader2, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getDefaultDateRange } from "@/lib/utils";
import { MARKETPLACE_TYPES, type CompanyWithAccounts, type MarketplaceType } from "@/types/database";

type CompanyFormState = {
  name: string;
  country: string;
  currency: string;
  timezone: string;
  language: string;
  is_default: boolean;
};

type AccountFormState = {
  company_id: string;
  marketplace: MarketplaceType;
  account_name: string;
  api_key: string;
  seller_id: string;
  is_active: boolean;
  is_default: boolean;
  sync_enabled: boolean;
};

const emptyCompanyForm: CompanyFormState = {
  name: "",
  country: "",
  currency: "RUB",
  timezone: "Europe/Moscow",
  language: "ru",
  is_default: false,
};

const emptyAccountForm: AccountFormState = {
  company_id: "",
  marketplace: "wildberries",
  account_name: "",
  api_key: "",
  seller_id: "",
  is_active: true,
  is_default: false,
  sync_enabled: true,
};

const MARKETPLACE_LABELS: Record<MarketplaceType, string> = {
  wildberries: "Wildberries",
  ozon: "Ozon",
  lamoda: "Lamoda",
};

export function CompaniesManager() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyWithAccounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyForm, setCompanyForm] = useState<CompanyFormState>(emptyCompanyForm);
  const [accountForm, setAccountForm] = useState<AccountFormState>(emptyAccountForm);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/companies");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load companies");
      setCompanies(data.companies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (!accountForm.company_id && companies.length > 0) {
      setAccountForm((prev) => ({ ...prev, company_id: companies[0].id }));
    }
  }, [accountForm.company_id, companies]);

  function resetCompanyForm() {
    setCompanyForm(emptyCompanyForm);
    setEditingCompanyId(null);
  }

  function resetAccountForm() {
    setAccountForm((prev) => ({
      ...emptyAccountForm,
      company_id: prev.company_id || companies[0]?.id || "",
    }));
    setEditingAccountId(null);
  }

  async function handleSaveCompany(event: React.FormEvent) {
    event.preventDefault();
    setSavingCompany(true);
    setMessage(null);
    setError(null);

    try {
      const payload = {
        name: companyForm.name.trim(),
        country: companyForm.country.trim() || null,
        currency: companyForm.currency.trim() || "RUB",
        timezone: companyForm.timezone.trim() || "Europe/Moscow",
        language: companyForm.language.trim() || "ru",
        is_default: companyForm.is_default,
      };

      const response = await fetch(
        editingCompanyId ? `/api/companies/${editingCompanyId}` : "/api/companies",
        {
          method: editingCompanyId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Save failed");

      setMessage(editingCompanyId ? "Company updated" : "Company created");
      resetCompanyForm();
      await loadCompanies();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingCompany(false);
    }
  }

  async function handleSaveAccount(event: React.FormEvent) {
    event.preventDefault();
    setSavingAccount(true);
    setMessage(null);
    setError(null);

    try {
      const payload = {
        company_id: accountForm.company_id,
        marketplace: accountForm.marketplace,
        account_name: accountForm.account_name.trim(),
        api_key: accountForm.api_key.trim(),
        seller_id: accountForm.seller_id.trim() || null,
        is_active: accountForm.is_active,
        is_default: accountForm.is_default,
        sync_enabled: accountForm.sync_enabled,
      };

      const response = await fetch(
        editingAccountId
          ? `/api/marketplace-accounts/${editingAccountId}`
          : "/api/marketplace-accounts",
        {
          method: editingAccountId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Save failed");

      setMessage(editingAccountId ? "Marketplace account updated" : "Marketplace account created");
      resetAccountForm();
      await loadCompanies();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingAccount(false);
    }
  }

  function startEditCompany(company: CompanyWithAccounts) {
    setEditingCompanyId(company.id);
    setCompanyForm({
      name: company.name,
      country: company.country ?? "",
      currency: company.currency,
      timezone: company.timezone,
      language: company.language,
      is_default: company.is_default,
    });
  }

  function startEditAccount(companyId: string, account: CompanyWithAccounts["accounts"][number]) {
    setEditingAccountId(account.id);
    setAccountForm({
      company_id: companyId,
      marketplace: account.marketplace,
      account_name: account.account_name,
      api_key: "",
      seller_id: account.seller_id ?? "",
      is_active: account.is_active,
      is_default: account.is_default,
      sync_enabled: account.sync_enabled,
    });
  }

  async function handleDeleteCompany(companyId: string) {
    if (!confirm("Delete this company and all its marketplace accounts?")) return;

    setBusyId(companyId);
    setError(null);
    try {
      const response = await fetch(`/api/companies/${companyId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Delete failed");
      setMessage("Company deleted");
      await loadCompanies();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteAccount(accountId: string) {
    if (!confirm("Delete this marketplace account?")) return;

    setBusyId(accountId);
    setError(null);
    try {
      const response = await fetch(`/api/marketplace-accounts/${accountId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Delete failed");
      setMessage("Marketplace account deleted");
      await loadCompanies();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleTest(accountId: string) {
    setBusyId(accountId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/marketplace-accounts/${accountId}?action=test`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Connection failed");
      setMessage(data.message ?? "Connection OK");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSync(accountId: string) {
    setBusyId(accountId);
    setError(null);
    setMessage(null);
    const range = getDefaultDateRange();

    try {
      const response = await fetch(`/api/marketplace-accounts/${accountId}?action=sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: range.from,
          dateTo: range.to,
          entities: ["products", "orders", "sales", "finance", "stock"],
        }),
      });
      const data = await response.json();
      if (response.status === 409) throw new Error(data.error ?? "Sync already running");
      if (!response.ok && response.status !== 202) throw new Error(data.error ?? "Sync failed");

      let results = (data.results ?? []) as Array<{ entity: string; recordsUpdated: number }>;
      let lastSyncStatus = data.lastSyncStatus ?? "success";

      if (response.status === 202) {
        setMessage("Sync running in background…");
        const pollStarted = Date.now();
        while (Date.now() - pollStarted < 15 * 60 * 1000) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const statusRes = await fetch(
            `/api/sync/status?marketplaceAccountId=${encodeURIComponent(accountId)}`,
            { cache: "no-store" }
          );
          const statusData = await statusRes.json();
          if (statusData.status === "running") continue;
          if (statusData.error) throw new Error(statusData.error);
          results = statusData.results ?? [];
          lastSyncStatus = statusData.status;
          break;
        }
      }

      const updated = results.reduce((sum, row) => sum + row.recordsUpdated, 0);
      setMessage(`Sync complete — ${updated} rows updated (${lastSyncStatus})`);
      await loadCompanies();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">{editingCompanyId ? "Edit Company" : "Add Company"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A company can own multiple marketplace accounts (Wildberries, Ozon, Lamoda, …).
        </p>

        <form onSubmit={handleSaveCompany} className="mt-6 grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span className="font-medium">Company Name</span>
            <input
              required
              value={companyForm.name}
              onChange={(event) => setCompanyForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="GVOnly"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Currency</span>
            <input
              value={companyForm.currency}
              onChange={(event) =>
                setCompanyForm((prev) => ({ ...prev, currency: event.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="RUB"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Timezone</span>
            <input
              value={companyForm.timezone}
              onChange={(event) =>
                setCompanyForm((prev) => ({ ...prev, timezone: event.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="Europe/Moscow"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Language</span>
            <input
              value={companyForm.language}
              onChange={(event) =>
                setCompanyForm((prev) => ({ ...prev, language: event.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="ru"
            />
          </label>

          <label className="space-y-1.5 text-sm sm:col-span-3">
            <span className="font-medium">Country (optional)</span>
            <input
              value={companyForm.country}
              onChange={(event) =>
                setCompanyForm((prev) => ({ ...prev, country: event.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="RU"
            />
          </label>

          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input
              type="checkbox"
              checked={companyForm.is_default}
              onChange={(event) =>
                setCompanyForm((prev) => ({ ...prev, is_default: event.target.checked }))
              }
            />
            <span>Default company</span>
          </label>

          <div className="flex gap-3 sm:col-span-3">
            <button
              type="submit"
              disabled={savingCompany}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {savingCompany && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Company
            </button>
            {editingCompanyId && (
              <button
                type="button"
                onClick={resetCompanyForm}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">
          {editingAccountId ? "Edit Marketplace Account" : "Add Marketplace Account"}
        </h2>

        <form onSubmit={handleSaveAccount} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Company</span>
            <select
              required
              value={accountForm.company_id}
              onChange={(event) =>
                setAccountForm((prev) => ({ ...prev, company_id: event.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Marketplace</span>
            <select
              required
              value={accountForm.marketplace}
              onChange={(event) =>
                setAccountForm((prev) => ({
                  ...prev,
                  marketplace: event.target.value as MarketplaceType,
                }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            >
              {MARKETPLACE_TYPES.map((marketplace) => (
                <option key={marketplace} value={marketplace}>
                  {MARKETPLACE_LABELS[marketplace]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span className="font-medium">Account Name</span>
            <input
              required
              value={accountForm.account_name}
              onChange={(event) =>
                setAccountForm((prev) => ({ ...prev, account_name: event.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="Wildberries Women"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Seller ID (optional)</span>
            <input
              value={accountForm.seller_id}
              onChange={(event) =>
                setAccountForm((prev) => ({ ...prev, seller_id: event.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">API Key</span>
            <input
              required={!editingAccountId}
              type="password"
              value={accountForm.api_key}
              onChange={(event) =>
                setAccountForm((prev) => ({ ...prev, api_key: event.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder={editingAccountId ? "Leave blank to keep current key" : "Paste API key"}
            />
          </label>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={accountForm.is_active}
              onChange={(event) =>
                setAccountForm((prev) => ({ ...prev, is_active: event.target.checked }))
              }
            />
            <span>Active account</span>
          </label>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={accountForm.is_default}
              onChange={(event) =>
                setAccountForm((prev) => ({ ...prev, is_default: event.target.checked }))
              }
            />
            <span>Default account for company</span>
          </label>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={accountForm.sync_enabled}
              onChange={(event) =>
                setAccountForm((prev) => ({ ...prev, sync_enabled: event.target.checked }))
              }
            />
            <span>Sync enabled</span>
          </label>

          <div className="flex gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={savingAccount}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {savingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Account
            </button>
            {editingAccountId && (
              <button
                type="button"
                onClick={resetAccountForm}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {message && <p className="text-sm text-success">{message}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <section className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Companies</h2>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading companies…
          </div>
        ) : companies.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">No companies yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {companies.map((company) => (
              <li key={company.id} className="px-6 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{company.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {company.country ?? "—"} · {company.currency} · {company.timezone} · {company.language}
                      {company.is_default ? " · default" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEditCompany(company)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busyId === company.id || companies.length <= 1}
                      onClick={() => handleDeleteCompany(company.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </div>

                {company.accounts.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">No marketplace accounts.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {company.accounts.map((account) => (
                      <li
                        key={account.id}
                        className="flex flex-col gap-3 rounded-xl border border-border bg-background/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium">{account.account_name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {MARKETPLACE_LABELS[account.marketplace]}
                            {account.seller_id ? ` · Seller ${account.seller_id}` : ""}
                            {account.has_api_key ? " · key configured" : " · no key"}
                            {!account.is_active ? " · inactive" : ""}
                            {account.is_default ? " · default" : ""}
                            {!account.sync_enabled ? " · sync off" : ""}
                            {account.last_sync_status
                              ? ` · sync ${account.last_sync_status}`
                              : ""}
                            {account.last_sync_at
                              ? ` · last ${new Date(account.last_sync_at).toLocaleString()}`
                              : ""}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEditAccount(company.id, account)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busyId === account.id}
                            onClick={() => handleTest(account.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                          >
                            {busyId === account.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <PlugZap className="h-3 w-3" />
                            )}
                            Test Connection
                          </button>
                          <button
                            type="button"
                            disabled={busyId === account.id}
                            onClick={() => handleSync(account.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
                          >
                            {busyId === account.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Sync Account
                          </button>
                          <button
                            type="button"
                            disabled={busyId === account.id}
                            onClick={() => handleDeleteAccount(account.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
