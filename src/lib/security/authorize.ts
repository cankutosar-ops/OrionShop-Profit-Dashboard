/**
 * Sprint 7.1.C — Centralized authorization (application layer, no RLS).
 *
 * Identity: authenticated session only (7.1.B).
 * Tenancy: app_metadata.orion claims expanded against companies/accounts.
 * Client-supplied company/account IDs are untrusted claims to validate — never identity.
 */

import { NextResponse } from "next/server";
import {
  requireAuth,
  isAuthFailure,
  isInternalServiceRequest,
  type AuthUser,
} from "@/lib/security/require-auth";
import {
  lookupMarketplaceAccount,
  resolveTenantMembership,
  type ResolvedTenantMembership,
} from "@/lib/security/tenant-membership";
import { FILTER_PARAMS } from "@/lib/filter-params";

export type AuthzContext = {
  user: AuthUser;
  isInternalService: boolean;
  /** Allowed companies for this principal. */
  companyIds: string[];
  /** Allowed marketplace accounts for this principal. */
  marketplaceAccountIds: string[];
  /** Canonical company for this request (when scoped). */
  companyId: string | null;
  /** Canonical marketplace account for this request (when scoped). */
  marketplaceAccountId: string | null;
};

export type AuthorizeScopeInput = {
  /** Untrusted claimed marketplace account id (query/body/path). */
  marketplaceAccountId?: string | null;
  /** Untrusted claimed company id (query/body/path). */
  companyId?: string | null;
  /** URL filter alias for account (`?account=`). */
  account?: string | null;
  /** URL filter alias for company (`?company=`). */
  company?: string | null;
  /**
   * When no account is claimed, resolve a default account within the user's allow-list.
   * Default false — prefer explicit scope.
   */
  allowDefaultAccount?: boolean;
  /** Require a resolved marketplace account (403/400 if missing after authorize). */
  requireMarketplaceAccount?: boolean;
  /** Cross-tenant fan-out (`allAccounts`) — internal service only. */
  allowAllAccounts?: boolean;
};

export function authForbiddenResponse(message = "Forbidden", code = "AUTHZ_FORBIDDEN") {
  return NextResponse.json(
    {
      error: "Forbidden",
      code,
      message,
    },
    { status: 403 }
  );
}

export function isAuthzFailure(
  value: AuthzContext | NextResponse
): value is NextResponse {
  return value instanceof NextResponse;
}

function claimedAccountId(input: AuthorizeScopeInput): string | null {
  const raw =
    input.marketplaceAccountId?.trim() ||
    input.account?.trim() ||
    "";
  return raw || null;
}

function claimedCompanyId(input: AuthorizeScopeInput): string | null {
  const raw = input.companyId?.trim() || input.company?.trim() || "";
  return raw || null;
}

function membershipAllowsCompany(
  membership: ResolvedTenantMembership,
  companyId: string
): boolean {
  return membership.companyIds.includes(companyId);
}

function membershipAllowsAccount(
  membership: ResolvedTenantMembership,
  marketplaceAccountId: string
): boolean {
  return membership.marketplaceAccountIds.includes(marketplaceAccountId);
}

async function resolveDefaultAccount(
  membership: ResolvedTenantMembership
): Promise<{ marketplaceAccountId: string; companyId: string } | null> {
  if (membership.marketplaceAccountIds.length === 0) return null;
  const first = membership.marketplaceAccountIds[0];
  const looked = await lookupMarketplaceAccount(first);
  if (!looked) return null;
  if (!membershipAllowsCompany(membership, looked.companyId)) return null;
  return looked;
}

/**
 * Authorize the request and optionally bind an untrusted tenant scope claim.
 * Returns 401 when unauthenticated, 403 when authenticated but not permitted.
 */
export async function authorize(
  request: Request,
  input: AuthorizeScopeInput = {}
): Promise<AuthzContext | NextResponse> {
  const auth = await requireAuth(request);
  if (isAuthFailure(auth)) return auth;

  const isInternalService = isInternalServiceRequest(request);
  const accountClaim = claimedAccountId(input);
  const companyClaim = claimedCompanyId(input);

  if (input.allowAllAccounts && !isInternalService) {
    return authForbiddenResponse(
      "Cross-tenant all-accounts operations require internal service authorization.",
      "AUTHZ_ALL_ACCOUNTS_FORBIDDEN"
    );
  }

  if (isInternalService) {
    let companyId: string | null = companyClaim;
    let marketplaceAccountId: string | null = accountClaim;

    if (accountClaim) {
      const looked = await lookupMarketplaceAccount(accountClaim);
      if (!looked) {
        return authForbiddenResponse(
          "Marketplace account not found or not permitted.",
          "AUTHZ_ACCOUNT_FORBIDDEN"
        );
      }
      if (companyClaim && companyClaim !== looked.companyId) {
        return authForbiddenResponse(
          "Marketplace account does not belong to the specified company.",
          "AUTHZ_TENANT_MISMATCH"
        );
      }
      marketplaceAccountId = looked.marketplaceAccountId;
      companyId = looked.companyId;
    } else if (input.allowDefaultAccount || input.requireMarketplaceAccount) {
      // Internal without claim: leave null unless require — caller may use allAccounts.
      if (input.requireMarketplaceAccount && !input.allowAllAccounts) {
        return NextResponse.json(
          {
            error: "Bad Request",
            code: "AUTHZ_ACCOUNT_REQUIRED",
            message: "marketplaceAccountId is required",
          },
          { status: 400 }
        );
      }
    }

    return {
      user: auth,
      isInternalService: true,
      companyIds: companyId ? [companyId] : [],
      marketplaceAccountIds: marketplaceAccountId ? [marketplaceAccountId] : [],
      companyId,
      marketplaceAccountId,
    };
  }

  const membership = await resolveTenantMembership(auth);
  if (membership.companyIds.length === 0) {
    return authForbiddenResponse(
      "No tenant membership for this user.",
      "AUTHZ_NO_MEMBERSHIP"
    );
  }

  let companyId: string | null = null;
  let marketplaceAccountId: string | null = null;

  if (accountClaim) {
    if (!membershipAllowsAccount(membership, accountClaim)) {
      return authForbiddenResponse(
        "Marketplace account is not permitted for this user.",
        "AUTHZ_ACCOUNT_FORBIDDEN"
      );
    }
    const looked = await lookupMarketplaceAccount(accountClaim);
    if (!looked) {
      return authForbiddenResponse(
        "Marketplace account is not permitted for this user.",
        "AUTHZ_ACCOUNT_FORBIDDEN"
      );
    }
    if (!membershipAllowsCompany(membership, looked.companyId)) {
      return authForbiddenResponse(
        "Company is not permitted for this user.",
        "AUTHZ_COMPANY_FORBIDDEN"
      );
    }
    if (companyClaim && companyClaim !== looked.companyId) {
      return authForbiddenResponse(
        "Marketplace account does not belong to the specified company.",
        "AUTHZ_TENANT_MISMATCH"
      );
    }
    if (companyClaim && !membershipAllowsCompany(membership, companyClaim)) {
      return authForbiddenResponse(
        "Company is not permitted for this user.",
        "AUTHZ_COMPANY_FORBIDDEN"
      );
    }
    marketplaceAccountId = looked.marketplaceAccountId;
    companyId = looked.companyId;
  } else if (companyClaim) {
    if (!membershipAllowsCompany(membership, companyClaim)) {
      return authForbiddenResponse(
        "Company is not permitted for this user.",
        "AUTHZ_COMPANY_FORBIDDEN"
      );
    }
    companyId = companyClaim;
    if (input.allowDefaultAccount || input.requireMarketplaceAccount) {
      const accountsForCompany = membership.marketplaceAccountIds;
      // Prefer an account under the claimed company
      for (const id of accountsForCompany) {
        const looked = await lookupMarketplaceAccount(id);
        if (looked && looked.companyId === companyClaim) {
          marketplaceAccountId = looked.marketplaceAccountId;
          break;
        }
      }
      if (!marketplaceAccountId && input.requireMarketplaceAccount) {
        return authForbiddenResponse(
          "No marketplace account permitted for this company.",
          "AUTHZ_ACCOUNT_FORBIDDEN"
        );
      }
    }
  } else if (input.allowDefaultAccount || input.requireMarketplaceAccount) {
    const fallback = await resolveDefaultAccount(membership);
    if (!fallback) {
      if (input.requireMarketplaceAccount) {
        return authForbiddenResponse(
          "No marketplace account permitted for this user.",
          "AUTHZ_ACCOUNT_FORBIDDEN"
        );
      }
    } else {
      marketplaceAccountId = fallback.marketplaceAccountId;
      companyId = fallback.companyId;
    }
  }

  if (input.requireMarketplaceAccount && !marketplaceAccountId) {
    return NextResponse.json(
      {
        error: "Bad Request",
        code: "AUTHZ_ACCOUNT_REQUIRED",
        message: "marketplaceAccountId is required",
      },
      { status: 400 }
    );
  }

  return {
    user: auth,
    isInternalService: false,
    companyIds: membership.companyIds,
    marketplaceAccountIds: membership.marketplaceAccountIds,
    companyId,
    marketplaceAccountId,
  };
}

/** Authorize using URL scope params plus optional JSON body claims (all untrusted). */
export async function authorizeRequestScope(
  request: Request,
  options: {
    body?: {
      marketplaceAccountId?: unknown;
      company_id?: unknown;
      companyId?: unknown;
      account?: unknown;
      company?: unknown;
      allAccounts?: unknown;
    };
    requireMarketplaceAccount?: boolean;
    allowDefaultAccount?: boolean;
    /** When true, treat body.allAccounts / ?all=1 as cross-tenant fan-out (internal only). */
    allowAllAccounts?: boolean;
  } = {}
): Promise<AuthzContext | NextResponse> {
  const url = new URL(request.url);
  const body = options.body ?? {};
  const allAccounts =
    options.allowAllAccounts === true ||
    body.allAccounts === true ||
    url.searchParams.get("all") === "1";

  const asStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  return authorize(request, {
    marketplaceAccountId:
      asStr(body.marketplaceAccountId) || url.searchParams.get("marketplaceAccountId"),
    companyId:
      asStr(body.company_id) ||
      asStr(body.companyId) ||
      url.searchParams.get("companyId"),
    account:
      asStr(body.account) ||
      url.searchParams.get(FILTER_PARAMS.account) ||
      url.searchParams.get("account"),
    company:
      asStr(body.company) ||
      url.searchParams.get(FILTER_PARAMS.company) ||
      url.searchParams.get("company"),
    requireMarketplaceAccount: options.requireMarketplaceAccount,
    allowDefaultAccount: options.allowDefaultAccount,
    allowAllAccounts: allAccounts,
  });
}


/** Assert a concrete account id is allowed for an already-authorized context. */
export function assertAccountInAuthz(
  authz: AuthzContext,
  marketplaceAccountId: string
): NextResponse | null {
  if (authz.isInternalService) return null;
  if (!authz.marketplaceAccountIds.includes(marketplaceAccountId)) {
    return authForbiddenResponse(
      "Marketplace account is not permitted for this user.",
      "AUTHZ_ACCOUNT_FORBIDDEN"
    );
  }
  return null;
}

/** Assert a concrete company id is allowed. */
export function assertCompanyInAuthz(
  authz: AuthzContext,
  companyId: string
): NextResponse | null {
  if (authz.isInternalService) return null;
  if (!authz.companyIds.includes(companyId)) {
    return authForbiddenResponse(
      "Company is not permitted for this user.",
      "AUTHZ_COMPANY_FORBIDDEN"
    );
  }
  return null;
}
