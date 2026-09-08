/**
 * Sprint 7.1.C — Shared tenant scope decision.
 *
 * Single rule set for both entry points:
 *  - Route Handlers   → `authorize` / `authorizeRequestScope` (src/lib/security/authorize.ts)
 *  - Server pages/RSC → `requirePageScope` (src/lib/security/page-scope.ts)
 *
 * Client-supplied account/company ids are untrusted claims to validate — never identity.
 * The decision is pure with respect to membership: the account→company lookup is injected
 * so the rule table can be verified without a database.
 */

import {
  lookupMarketplaceAccount,
  type ResolvedTenantMembership,
} from "@/lib/security/tenant-membership";

export type TenantScopeDenialCode =
  | "AUTHZ_NO_MEMBERSHIP"
  | "AUTHZ_ACCOUNT_FORBIDDEN"
  | "AUTHZ_COMPANY_FORBIDDEN"
  | "AUTHZ_TENANT_MISMATCH"
  | "AUTHZ_ACCOUNT_REQUIRED";

export type TenantScopeClaims = {
  /** Untrusted claimed marketplace account id (query/body/path). */
  account?: string | null;
  /** Untrusted claimed company id (query/body/path). */
  company?: string | null;
};

export type TenantScopeOptions = {
  /** Resolve a default account inside the allow-list when nothing is claimed. */
  allowDefaultAccount?: boolean;
  /** Fail when no account could be resolved. */
  requireMarketplaceAccount?: boolean;
};

export type AccountCompanyLookup = (
  marketplaceAccountId: string
) => Promise<{ marketplaceAccountId: string; companyId: string } | null>;

export type TenantScopeDecision =
  | { ok: true; companyId: string | null; marketplaceAccountId: string | null }
  | { ok: false; code: TenantScopeDenialCode; message: string };

function deny(code: TenantScopeDenialCode, message: string): TenantScopeDecision {
  return { ok: false, code, message };
}

export function normalizeClaim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function allowsCompany(membership: ResolvedTenantMembership, companyId: string): boolean {
  return membership.companyIds.includes(companyId);
}

function allowsAccount(
  membership: ResolvedTenantMembership,
  marketplaceAccountId: string
): boolean {
  return membership.marketplaceAccountIds.includes(marketplaceAccountId);
}

async function defaultAccountFor(
  membership: ResolvedTenantMembership,
  lookup: AccountCompanyLookup
): Promise<{ marketplaceAccountId: string; companyId: string } | null> {
  if (membership.marketplaceAccountIds.length === 0) return null;
  const looked = await lookup(membership.marketplaceAccountIds[0]);
  if (!looked) return null;
  if (!allowsCompany(membership, looked.companyId)) return null;
  return looked;
}

/**
 * Decide the tenant scope for an authenticated (non-internal-service) principal.
 * Denials are returned, never thrown — callers map them to 403 / redirect.
 */
export async function decideTenantScope(
  membership: ResolvedTenantMembership,
  claims: TenantScopeClaims,
  options: TenantScopeOptions = {},
  lookup: AccountCompanyLookup = lookupMarketplaceAccount
): Promise<TenantScopeDecision> {
  if (membership.companyIds.length === 0) {
    return deny("AUTHZ_NO_MEMBERSHIP", "No tenant membership for this user.");
  }

  const accountClaim = normalizeClaim(claims.account);
  const companyClaim = normalizeClaim(claims.company);

  let companyId: string | null = null;
  let marketplaceAccountId: string | null = null;

  if (accountClaim) {
    if (!allowsAccount(membership, accountClaim)) {
      return deny(
        "AUTHZ_ACCOUNT_FORBIDDEN",
        "Marketplace account is not permitted for this user."
      );
    }
    const looked = await lookup(accountClaim);
    if (!looked) {
      return deny(
        "AUTHZ_ACCOUNT_FORBIDDEN",
        "Marketplace account is not permitted for this user."
      );
    }
    if (!allowsCompany(membership, looked.companyId)) {
      return deny("AUTHZ_COMPANY_FORBIDDEN", "Company is not permitted for this user.");
    }
    if (companyClaim && companyClaim !== looked.companyId) {
      return deny(
        "AUTHZ_TENANT_MISMATCH",
        "Marketplace account does not belong to the specified company."
      );
    }
    if (companyClaim && !allowsCompany(membership, companyClaim)) {
      return deny("AUTHZ_COMPANY_FORBIDDEN", "Company is not permitted for this user.");
    }
    marketplaceAccountId = looked.marketplaceAccountId;
    companyId = looked.companyId;
  } else if (companyClaim) {
    if (!allowsCompany(membership, companyClaim)) {
      return deny("AUTHZ_COMPANY_FORBIDDEN", "Company is not permitted for this user.");
    }
    companyId = companyClaim;
    if (options.allowDefaultAccount || options.requireMarketplaceAccount) {
      for (const id of membership.marketplaceAccountIds) {
        const looked = await lookup(id);
        if (looked && looked.companyId === companyClaim) {
          marketplaceAccountId = looked.marketplaceAccountId;
          break;
        }
      }
      if (!marketplaceAccountId && options.requireMarketplaceAccount) {
        return deny(
          "AUTHZ_ACCOUNT_FORBIDDEN",
          "No marketplace account permitted for this company."
        );
      }
    }
  } else if (options.allowDefaultAccount || options.requireMarketplaceAccount) {
    const fallback = await defaultAccountFor(membership, lookup);
    if (!fallback) {
      if (options.requireMarketplaceAccount) {
        return deny(
          "AUTHZ_ACCOUNT_FORBIDDEN",
          "No marketplace account permitted for this user."
        );
      }
    } else {
      marketplaceAccountId = fallback.marketplaceAccountId;
      companyId = fallback.companyId;
    }
  }

  if (options.requireMarketplaceAccount && !marketplaceAccountId) {
    return deny("AUTHZ_ACCOUNT_REQUIRED", "marketplaceAccountId is required");
  }

  return { ok: true, companyId, marketplaceAccountId };
}
