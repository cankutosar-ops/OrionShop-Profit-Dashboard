/**
 * Server page / RSC tenant authorization.
 *
 * Route Handlers go through `authorize` (src/lib/security/authorize.ts).
 * Server-rendered pages go through here. Both evaluate the same rule table
 * (`decideTenantScope`) against the same membership source (`app_metadata.orion`),
 * so `?account=` / `?company=` cannot widen access on either entry point.
 *
 * Route Handlers answer a denial with 403. Pages have no response object, so a
 * denial redirects to `/access-denied` with the denial code — no tenant data is
 * ever resolved or rendered for a claim outside the membership allow-list.
 */

import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/security/require-auth";
import { resolveTenantMembership } from "@/lib/security/tenant-membership";
import {
  decideTenantScope,
  normalizeClaim,
  type TenantScopeClaims,
  type TenantScopeDenialCode,
} from "@/lib/security/tenant-scope";

export const ACCESS_DENIED_PATH = "/access-denied";

export type PageTenantScope = {
  userId: string;
  companyId: string;
  marketplaceAccountId: string;
  /** Full allow-list for this principal (selector UX). */
  companyIds: string[];
  marketplaceAccountIds: string[];
};

export type PageScopeDenialReason = TenantScopeDenialCode | "AUTH_REQUIRED";

export type PageScopeResult =
  | { ok: true; scope: PageTenantScope }
  | { ok: false; code: PageScopeDenialReason; message: string };

/**
 * Per-request dedupe: one membership resolve + scope decision per (account, company),
 * shared by the page and every server component beneath it.
 */
const authorizePageScopeCached = cache(
  async (account: string, company: string): Promise<PageScopeResult> => {
    const user = await getAuthUser();
    if (!user) {
      return {
        ok: false,
        code: "AUTH_REQUIRED",
        message: "Valid authenticated session required.",
      };
    }

    const membership = await resolveTenantMembership(user);
    const decision = await decideTenantScope(
      membership,
      { account: account || null, company: company || null },
      { allowDefaultAccount: true, requireMarketplaceAccount: true }
    );

    if (!decision.ok) {
      return { ok: false, code: decision.code, message: decision.message };
    }

    return {
      ok: true,
      scope: {
        userId: user.id,
        // requireMarketplaceAccount guarantees both are resolved.
        companyId: decision.companyId!,
        marketplaceAccountId: decision.marketplaceAccountId!,
        companyIds: membership.companyIds,
        marketplaceAccountIds: membership.marketplaceAccountIds,
      },
    };
  }
);

/** Non-throwing variant — for pages that want to render their own denial state. */
export async function authorizePageScope(
  claims: TenantScopeClaims
): Promise<PageScopeResult> {
  return authorizePageScopeCached(
    normalizeClaim(claims.account) ?? "",
    normalizeClaim(claims.company) ?? ""
  );
}

/**
 * Resolve the authorized tenant scope for a server page.
 * Redirects instead of returning when the claim is not permitted.
 */
export async function requirePageScope(
  claims: TenantScopeClaims
): Promise<PageTenantScope> {
  const result = await authorizePageScope(claims);
  if (result.ok) return result.scope;

  if (result.code === "AUTH_REQUIRED") {
    redirect("/login");
  }
  redirect(`${ACCESS_DENIED_PATH}?code=${encodeURIComponent(result.code)}`);
}
