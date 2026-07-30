"use client";

import { Building2, ChevronDown, Store } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccountSwitch } from "@/components/layout/account-switch-context";
import { notifyDashboardHeaderPopupOpen } from "@/lib/dashboard-header-popup";
import { replaceUrlIfChanged, fetchDashboardCompanies } from "@/lib/dashboard-lifecycle";
import { navigateScope } from "@/lib/scope-navigation";
import { FILTER_PARAMS } from "@/lib/filter-params";
import { filterOperationalMarketplaceAccounts } from "@/lib/marketplace-account-visibility";
import {
  lastSyncDateKey,
  rangeExtendsBeyondLastSync,
  SYNC_DATE_PARAM,
} from "@/lib/marketplace-sync-date";
import { getDefaultDateRange } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { CompanyWithAccounts, MarketplaceAccountPublic } from "@/types/database";

function clearSyncDateParams(params: URLSearchParams) {
  params.delete(SYNC_DATE_PARAM.manual);
  params.delete(SYNC_DATE_PARAM.adjusted);
  params.delete(SYNC_DATE_PARAM.accountSwitched);
  params.delete(FILTER_PARAMS.brand);
}

/**
 * Apply date clamp for the target account in the SAME navigation as the switch.
 * Avoids a second Dashboard reload from MarketplaceDateScope + refresh.
 */
function applyDashboardDateScopeForAccount(
  params: URLSearchParams,
  account: MarketplaceAccountPublic | null | undefined
) {
  const defaults = getDefaultDateRange();
  const from = params.get(FILTER_PARAMS.from) ?? defaults.from;
  const to = params.get(FILTER_PARAMS.to) ?? defaults.to;
  const lastSyncAt = account?.last_successful_sync_at ?? account?.last_sync_at ?? null;
  const lastSyncDay = lastSyncDateKey(lastSyncAt);

  const needsAdjust =
    !!lastSyncDay &&
    rangeExtendsBeyondLastSync(from, to, lastSyncAt) &&
    !(from === lastSyncDay && to === lastSyncDay);

  if (needsAdjust && lastSyncDay) {
    params.set(FILTER_PARAMS.from, lastSyncDay);
    params.set(FILTER_PARAMS.to, lastSyncDay);
    params.set(SYNC_DATE_PARAM.adjusted, "1");
    params.delete(SYNC_DATE_PARAM.manual);
  }
}

const MARKETPLACE_LABELS: Record<string, string> = {
  wildberries: "Wildberries",
  ozon: "Ozon",
  lamoda: "Lamoda",
};

function Dropdown({
  label,
  icon: Icon,
  value,
  options,
  onSelect,
  disabled,
}: {
  label: string;
  icon: typeof Building2;
  value: string;
  options: { id: string; label: string; hint?: string }[];
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() =>
          setOpen((current) => {
            const next = !current;
            if (next) notifyDashboardHeaderPopupOpen("tenant");
            return next;
          })
        }
        disabled={disabled || options.length === 0}
        className={cn(
          "inline-flex min-w-[180px] items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{active?.label ?? label}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && options.length > 0 && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                onSelect(option.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full flex-col px-3 py-2.5 text-left text-sm transition-colors hover:bg-card-hover disabled:opacity-50",
                option.id === active?.id && "bg-primary/10 text-primary"
              )}
            >
              <span className="truncate font-medium">{option.label}</span>
              {option.hint && (
                <span className="truncate text-[10px] uppercase text-muted-foreground">
                  {option.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TenantSelectors() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isBusy, runAccountSwitch } = useAccountSwitch();

  const [companies, setCompanies] = useState<CompanyWithAccounts[]>([]);
  const [loading, setLoading] = useState(true);

  const activeCompanyId = searchParams.get("company");
  const activeAccountId = searchParams.get("account");
  const currentQuery = searchParams.toString();
  const tenantDefaultsAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanies() {
      try {
        const rows = await fetchDashboardCompanies();
        if (!cancelled) {
          setCompanies(rows);
        }
      } catch {
        if (!cancelled) setCompanies([]);
      } finally {
        setLoading(false);
      }
    }

    loadCompanies();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCompany =
    companies.find((company) => company.id === activeCompanyId) ??
    companies.find((company) => company.is_default) ??
    companies[0] ??
    null;

  const companyAccounts = activeCompany?.accounts ?? [];
  /** Production selectors: active + non-test/demo only. Settings still lists all. */
  const operationalAccounts = filterOperationalMarketplaceAccounts(companyAccounts);

  const activeAccount =
    operationalAccounts.find((account) => account.id === activeAccountId) ??
    operationalAccounts.find((account) => account.is_default) ??
    operationalAccounts[0] ??
    null;

  useEffect(() => {
    if (loading || companies.length === 0 || isBusy) return;

    const companyId = activeCompany?.id;
    const accountId = activeAccount?.id;
    if (!companyId || !accountId) return;

    const needsCompany = activeCompanyId !== companyId;
    const needsAccount = activeAccountId !== accountId;

    if (needsCompany || needsAccount) {
      const targetKey = `${companyId}:${accountId}`;
      if (tenantDefaultsAppliedRef.current === targetKey) return;

      const changed = replaceUrlIfChanged(router, pathname, currentQuery, (params) => {
        params.set("company", companyId);
        params.set("account", accountId);
        clearSyncDateParams(params);
      });

      if (changed) {
        tenantDefaultsAppliedRef.current = targetKey;
      }
    }
  }, [
    activeAccount?.id,
    activeAccountId,
    activeCompany?.id,
    activeCompanyId,
    companies.length,
    currentQuery,
    isBusy,
    loading,
    pathname,
    router,
  ]);

  function navigateToTenant(next: {
    company?: string;
    account?: string;
    accountRow?: MarketplaceAccountPublic | null;
  }) {
    if (isBusy) return;

    const sameCompany = !next.company || next.company === activeCompanyId;
    const sameAccount = !next.account || next.account === activeAccountId;
    if (sameCompany && sameAccount) return;

    runAccountSwitch(
      {
        company: next.company ?? null,
        account: next.account ?? null,
      },
      () => {
        const params = new URLSearchParams(searchParams.toString());
        if (next.company) params.set("company", next.company);
        if (next.account) params.set("account", next.account);
        clearSyncDateParams(params);

        // One navigation: company + account + date clamp together (Dashboard).
        if (pathname === "/") {
          applyDashboardDateScopeForAccount(params, next.accountRow);
        }

        const kind =
          next.company && next.company !== activeCompanyId
            ? "company_switch"
            : "account_switch";
        try {
          sessionStorage.setItem(
            "orionshop.perf.nav",
            JSON.stringify({
              kind,
              startedAt: Date.now(),
              perfStart: performance.now(),
            })
          );
        } catch {
          // ignore
        }

        navigateScope(router, `${pathname}?${params.toString()}`, "push");
      }
    );
  }

  function selectCompany(companyId: string) {
    const company = companies.find((row) => row.id === companyId);
    const accounts = filterOperationalMarketplaceAccounts(company?.accounts ?? []);
    const account =
      accounts.find((row) => row.is_default) ?? accounts[0] ?? null;
    navigateToTenant({
      company: companyId,
      account: account?.id,
      accountRow: account,
    });
  }

  function selectAccount(accountId: string) {
    const account = operationalAccounts.find((row) => row.id === accountId) ?? null;
    navigateToTenant({
      company: activeCompany?.id,
      account: accountId,
      accountRow: account,
    });
  }

  const selectorsDisabled = loading || isBusy;

  const companyOptions = companies.map((company) => {
    const visibleCount = filterOperationalMarketplaceAccounts(company.accounts).length;
    return {
      id: company.id,
      label: company.name,
      hint: `${visibleCount} account${visibleCount === 1 ? "" : "s"}`,
    };
  });

  const accountOptions = operationalAccounts.map((account: MarketplaceAccountPublic) => ({
    id: account.id,
    label: account.account_name,
    hint: MARKETPLACE_LABELS[account.marketplace] ?? account.marketplace,
  }));

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Dropdown
        label={loading ? "Loading…" : isBusy ? "Switching…" : "Company"}
        icon={Building2}
        value={activeCompany?.id ?? ""}
        options={companyOptions}
        onSelect={selectCompany}
        disabled={selectorsDisabled}
      />
      <Dropdown
        label={loading ? "Loading…" : isBusy ? "Switching…" : "Marketplace"}
        icon={Store}
        value={activeAccount?.id ?? ""}
        options={accountOptions}
        onSelect={selectAccount}
        disabled={selectorsDisabled || operationalAccounts.length === 0}
      />
    </div>
  );
}
