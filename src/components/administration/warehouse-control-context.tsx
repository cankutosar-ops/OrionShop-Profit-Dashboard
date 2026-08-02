"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WarehouseControlCenterPayload } from "@/lib/administration/warehouse-control-types";
import type { CompanyWithAccounts } from "@/types/database";

type AccountOption = {
  id: string;
  label: string;
  companyId: string;
  companyName: string;
};

type WarehouseControlContextValue = {
  accounts: AccountOption[];
  accountId: string | null;
  setAccountId: (id: string) => void;
  simulate: boolean;
  setSimulate: (v: boolean) => void;
  data: WarehouseControlCenterPayload | null;
  loading: boolean;
  error: string | null;
  message: string | null;
  refresh: () => Promise<void>;
  postAction: (body: Record<string, unknown>) => Promise<unknown>;
};

const WarehouseControlContext = createContext<WarehouseControlContextValue | null>(null);

export function useWarehouseControl() {
  const ctx = useContext(WarehouseControlContext);
  if (!ctx) throw new Error("useWarehouseControl requires WarehouseControlProvider");
  return ctx;
}

export function WarehouseControlProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [data, setData] = useState<WarehouseControlCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/companies");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load companies");
        const companies = (json.companies ?? []) as CompanyWithAccounts[];
        const opts: AccountOption[] = [];
        for (const company of companies) {
          for (const account of company.accounts) {
            opts.push({
              id: account.id,
              label: `${account.account_name} (${account.marketplace})`,
              companyId: company.id,
              companyName: company.name,
            });
          }
        }
        setAccounts(opts);
        setAccountId((prev) => prev ?? opts[0]?.id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!accountId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        marketplaceAccountId: accountId,
        view: "control",
      });
      if (simulate) qs.set("simulate", "1");
      const res = await fetch(`/api/warehouse/ops?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load warehouse control");
      setData(json as WarehouseControlCenterPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load warehouse control");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, simulate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      if (!accountId) throw new Error("Select a marketplace account");
      setMessage(null);
      const res = await fetch("/api/warehouse/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplaceAccountId: accountId,
          simulate,
          ...body,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Action failed");
      setMessage(`Action “${String(body.action ?? "tick")}” completed.`);
      await refresh();
      return json;
    },
    [accountId, simulate, refresh]
  );

  const value = useMemo(
    () => ({
      accounts,
      accountId,
      setAccountId,
      simulate,
      setSimulate,
      data,
      loading,
      error,
      message,
      refresh,
      postAction,
    }),
    [
      accounts,
      accountId,
      simulate,
      data,
      loading,
      error,
      message,
      refresh,
      postAction,
    ]
  );

  return (
    <WarehouseControlContext.Provider value={value}>
      {children}
    </WarehouseControlContext.Provider>
  );
}

export function WarehouseAccountToolbar() {
  const {
    accounts,
    accountId,
    setAccountId,
    simulate,
    setSimulate,
    refresh,
    loading,
    error,
    message,
  } = useWarehouseControl();

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="text-muted-foreground">Marketplace Account</span>
          <select
            className="mt-1 block min-w-[240px] rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
            value={accountId ?? ""}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {!accounts.length ? <option value="">No accounts</option> : null}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.companyName} · {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={simulate}
            onChange={(e) => setSimulate(e.target.checked)}
          />
          Simulate (in-memory demo)
        </label>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-[var(--radius-control)] border border-border px-3 py-2 text-xs font-medium hover:bg-card-hover disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
