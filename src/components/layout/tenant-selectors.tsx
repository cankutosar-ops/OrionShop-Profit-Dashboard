"use client";

import { Building2, ChevronDown, Store } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SYNC_DATE_PARAM } from "@/lib/marketplace-sync-date";
import { FILTER_PARAMS } from "@/lib/filter-params";
import { replaceUrlIfChanged, fetchDashboardCompanies } from "@/lib/dashboard-lifecycle";
import { cn } from "@/lib/utils";
import type { CompanyWithAccounts, MarketplaceAccountPublic } from "@/types/database";

function clearSyncDateParams(params: URLSearchParams) {
  params.delete(SYNC_DATE_PARAM.manual);
  params.delete(SYNC_DATE_PARAM.adjusted);
  params.delete(SYNC_DATE_PARAM.accountSwitched);
  params.delete(FILTER_PARAMS.brand);
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
        onClick={() => setOpen((current) => !current)}
        disabled={disabled || options.length === 0}
        className={cn(
          "inline-flex min-w-[160px] items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-card-hover disabled:opacity-50"
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
              onClick={() => {
                onSelect(option.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full flex-col px-3 py-2.5 text-left text-sm transition-colors hover:bg-card-hover",
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
        // Always exit the loading state — Sprint 6.7 URL updates can remount
        // this component before fetch completes; skipping here leaves "Loading…" forever.
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

  const activeAccount =
    companyAccounts.find((account) => account.id === activeAccountId) ??
    companyAccounts.find((account) => account.is_default && account.is_active) ??
    companyAccounts.find((account) => account.is_active) ??
    companyAccounts[0] ??
    null;

  useEffect(() => {
    if (loading || companies.length === 0) return;

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
    loading,
    pathname,
    router,
  ]);

  function updateParams(next: { company?: string; account?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.company) params.set("company", next.company);
    if (next.account) params.set("account", next.account);
    clearSyncDateParams(params);
    if (pathname === "/") {
      params.set(SYNC_DATE_PARAM.accountSwitched, "1");
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function selectCompany(companyId: string) {
    const company = companies.find((row) => row.id === companyId);
    const account =
      company?.accounts.find((row) => row.is_default && row.is_active) ??
      company?.accounts.find((row) => row.is_active) ??
      company?.accounts[0] ??
      null;
    updateParams({ company: companyId, account: account?.id });
  }

  function selectAccount(accountId: string) {
    updateParams({ company: activeCompany?.id, account: accountId });
  }

  const companyOptions = companies.map((company) => ({
    id: company.id,
    label: company.name,
    hint: `${company.accounts.length} account${company.accounts.length === 1 ? "" : "s"}`,
  }));

  const accountOptions = companyAccounts.map((account: MarketplaceAccountPublic) => ({
    id: account.id,
    label: account.account_name,
    hint: `${MARKETPLACE_LABELS[account.marketplace] ?? account.marketplace}${
      account.is_active ? "" : " · inactive"
    }`,
  }));

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Dropdown
        label={loading ? "Loading…" : "Company"}
        icon={Building2}
        value={activeCompany?.id ?? ""}
        options={companyOptions}
        onSelect={selectCompany}
        disabled={loading}
      />
      <Dropdown
        label={loading ? "Loading…" : "Marketplace"}
        icon={Store}
        value={activeAccount?.id ?? ""}
        options={accountOptions}
        onSelect={selectAccount}
        disabled={loading || companyAccounts.length === 0}
      />
    </div>
  );
}
