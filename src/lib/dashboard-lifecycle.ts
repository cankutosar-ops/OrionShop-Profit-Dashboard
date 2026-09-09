import type { CompanyWithAccounts } from "@/types/database";
import { navigateScope } from "@/lib/scope-navigation";

type RouterLike = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
  push: (href: string, options?: { scroll?: boolean }) => void;
  refresh: () => void;
};

/** Replace the URL only when the query string actually changes. */
export function replaceUrlIfChanged(
  router: RouterLike,
  pathname: string,
  currentQuery: string,
  mutate: (params: URLSearchParams) => void,
  navKind?: string
): boolean {
  const params = new URLSearchParams(currentQuery);
  mutate(params);
  const nextQuery = params.toString();
  if (nextQuery === currentQuery) return false;

  if (typeof window !== "undefined" && navKind) {
    try {
      sessionStorage.setItem(
        "orionshop.perf.nav",
        JSON.stringify({ kind: navKind, startedAt: Date.now(), perfStart: performance.now() })
      );
    } catch {
      // ignore
    }
  }

  navigateScope(
    router,
    nextQuery ? `${pathname}?${nextQuery}` : pathname,
    "replace"
  );
  return true;
}

let companiesCache: { data: CompanyWithAccounts[]; fetchedAt: number } | null = null;
let companiesInflight: Promise<CompanyWithAccounts[]> | null = null;

const COMPANIES_CACHE_MS = 3_000;

export function invalidateDashboardCompaniesCache(): void {
  companiesCache = null;
}

/** Dedupe parallel /api/companies reads from dashboard client components. */
export async function fetchDashboardCompanies(): Promise<CompanyWithAccounts[]> {
  const now = Date.now();
  if (companiesCache && now - companiesCache.fetchedAt < COMPANIES_CACHE_MS) {
    return companiesCache.data;
  }

  if (!companiesInflight) {
    companiesInflight = fetch("/api/companies")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load companies");
        }
        const companies = (data.companies ?? []) as CompanyWithAccounts[];
        companiesCache = { data: companies, fetchedAt: Date.now() };
        return companies;
      })
      .finally(() => {
        companiesInflight = null;
      });
  }

  return companiesInflight;
}
