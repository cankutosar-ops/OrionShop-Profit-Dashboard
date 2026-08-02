/**
 * Sprint 7.1.C — Tenant membership claims (no RLS).
 * Sprint 11.4 — preserve optional role; revoke / marketplace access helpers.
 *
 * Source of truth: Supabase Auth `app_metadata.orion` (service-role writable only).
 * Never trust client body/query/headers for membership.
 */

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizePlatformRole,
  type PlatformRole,
} from "@/lib/security/roles";

export const ORION_TENANT_METADATA_KEY = "orion";

export type OrionTenantClaims = {
  /** Allowed company (organization) IDs for this user. */
  company_ids: string[];
  /**
   * Optional tighter account allow-list.
   * When omitted/empty, all marketplace accounts under `company_ids` are allowed.
   */
  marketplace_account_ids?: string[];
  /** Optional platform role (Administration). Not used by AuthZ scope checks. */
  role?: PlatformRole;
};

export type ResolvedTenantMembership = {
  companyIds: string[];
  marketplaceAccountIds: string[];
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

function readOrionBag(user: User): Record<string, unknown> {
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const orion = (meta[ORION_TENANT_METADATA_KEY] ?? meta.tenant ?? null) as
    | Record<string, unknown>
    | null;
  if (!orion || typeof orion !== "object") return {};
  return orion;
}

/** Read raw tenant claims from the authenticated user (session JWT / getUser). */
export function readTenantClaims(user: User): OrionTenantClaims {
  const orion = readOrionBag(user);
  const role = normalizePlatformRole(orion.role);

  return {
    company_ids: asStringArray(orion.company_ids ?? orion.companyIds),
    marketplace_account_ids: asStringArray(
      orion.marketplace_account_ids ?? orion.marketplaceAccountIds
    ),
    ...(role ? { role } : {}),
  };
}

/** Expand claims into concrete company + marketplace account allow-lists. */
export async function resolveTenantMembership(user: User): Promise<ResolvedTenantMembership> {
  const claims = readTenantClaims(user);
  const companyIds = claims.company_ids;
  if (companyIds.length === 0) {
    return { companyIds: [], marketplaceAccountIds: [] };
  }

  const explicitAccounts = claims.marketplace_account_ids ?? [];
  const supabase = createAdminClient();

  let query = supabase
    .from("marketplace_accounts")
    .select("id, company_id")
    .in("company_id", companyIds);

  if (explicitAccounts.length > 0) {
    query = query.in("id", explicitAccounts);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to resolve tenant membership: ${error.message}`);
  }

  const marketplaceAccountIds = (data ?? [])
    .filter((row) => companyIds.includes(String(row.company_id)))
    .map((row) => String(row.id));

  return { companyIds, marketplaceAccountIds };
}

/** Lookup account → company (service_role). */
export async function lookupMarketplaceAccount(
  marketplaceAccountId: string
): Promise<{ marketplaceAccountId: string; companyId: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marketplace_accounts")
    .select("id, company_id")
    .eq("id", marketplaceAccountId)
    .maybeSingle();
  if (error) throw new Error(`Failed to lookup marketplace account: ${error.message}`);
  if (!data?.id) return null;
  return {
    marketplaceAccountId: String(data.id),
    companyId: String(data.company_id),
  };
}

/** Persist/replace orion tenant claims on a user (admin only). Preserves unknown orion keys + role. */
export async function setUserTenantClaims(
  userId: string,
  claims: OrionTenantClaims
): Promise<void> {
  const supabase = createAdminClient();
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError) throw new Error(`Failed to load user: ${getError.message}`);

  const prev = (existing.user?.app_metadata ?? {}) as Record<string, unknown>;
  const prevOrion = (prev[ORION_TENANT_METADATA_KEY] ?? {}) as Record<string, unknown>;
  const role =
    claims.role !== undefined
      ? claims.role
      : normalizePlatformRole(prevOrion.role) ?? undefined;

  const nextOrion: Record<string, unknown> = {
    ...prevOrion,
    company_ids: asStringArray(claims.company_ids),
  };

  if (role) nextOrion.role = role;
  else delete nextOrion.role;

  if (claims.marketplace_account_ids && claims.marketplace_account_ids.length > 0) {
    nextOrion.marketplace_account_ids = asStringArray(claims.marketplace_account_ids);
  } else {
    delete nextOrion.marketplace_account_ids;
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...prev,
      [ORION_TENANT_METADATA_KEY]: nextOrion,
    },
  });
  if (error) throw new Error(`Failed to update tenant claims: ${error.message}`);
}

/** Grant a company to a user (union into existing claims). */
export async function grantCompanyToUser(userId: string, companyId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError) throw new Error(`Failed to load user: ${getError.message}`);
  if (!existing.user) throw new Error("User not found");

  const claims = readTenantClaims(existing.user);
  const company_ids = [...new Set([...claims.company_ids, String(companyId)])];
  await setUserTenantClaims(userId, {
    company_ids,
    marketplace_account_ids: claims.marketplace_account_ids,
    role: claims.role,
  });
}

/** Remove a company membership (and drop marketplace accounts under that company). */
export async function revokeCompanyFromUser(userId: string, companyId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError) throw new Error(`Failed to load user: ${getError.message}`);
  if (!existing.user) throw new Error("User not found");

  const claims = readTenantClaims(existing.user);
  const company_ids = claims.company_ids.filter((id) => id !== String(companyId));

  let marketplace_account_ids = claims.marketplace_account_ids;
  if (marketplace_account_ids && marketplace_account_ids.length > 0) {
    const { data } = await supabase
      .from("marketplace_accounts")
      .select("id")
      .eq("company_id", companyId);
    const drop = new Set((data ?? []).map((r) => String(r.id)));
    marketplace_account_ids = marketplace_account_ids.filter((id) => !drop.has(id));
  }

  await setUserTenantClaims(userId, {
    company_ids,
    marketplace_account_ids,
    role: claims.role,
  });
}

/** Set platform role on orion claims (Administration). */
export async function setUserPlatformRole(userId: string, role: PlatformRole): Promise<void> {
  const supabase = createAdminClient();
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError) throw new Error(`Failed to load user: ${getError.message}`);
  if (!existing.user) throw new Error("User not found");

  const claims = readTenantClaims(existing.user);
  await setUserTenantClaims(userId, {
    ...claims,
    role,
  });
}

/**
 * Grant a marketplace account. If user currently has unrestricted access (no list),
 * granting is a no-op. If restricted, add to allow-list.
 */
export async function grantMarketplaceAccountToUser(
  userId: string,
  marketplaceAccountId: string
): Promise<void> {
  const account = await lookupMarketplaceAccount(marketplaceAccountId);
  if (!account) throw new Error("Marketplace account not found");

  const supabase = createAdminClient();
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError) throw new Error(`Failed to load user: ${getError.message}`);
  if (!existing.user) throw new Error("User not found");

  const claims = readTenantClaims(existing.user);
  if (!claims.company_ids.includes(account.companyId)) {
    throw new Error("User is not a member of the account's company");
  }

  const explicit = claims.marketplace_account_ids ?? [];
  if (explicit.length === 0) {
    // Unrestricted under company — already has access.
    return;
  }

  await setUserTenantClaims(userId, {
    ...claims,
    marketplace_account_ids: [...new Set([...explicit, marketplaceAccountId])],
  });
}

/**
 * Revoke a marketplace account. If unrestricted, expands to all company accounts
 * then removes the target (AuthZ 7.1.C semantics).
 */
export async function revokeMarketplaceAccountFromUser(
  userId: string,
  marketplaceAccountId: string
): Promise<void> {
  const account = await lookupMarketplaceAccount(marketplaceAccountId);
  if (!account) throw new Error("Marketplace account not found");

  const supabase = createAdminClient();
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError) throw new Error(`Failed to load user: ${getError.message}`);
  if (!existing.user) throw new Error("User not found");

  const claims = readTenantClaims(existing.user);
  let explicit = claims.marketplace_account_ids ?? [];

  if (explicit.length === 0) {
    const resolved = await resolveTenantMembership(existing.user);
    explicit = resolved.marketplaceAccountIds;
  }

  await setUserTenantClaims(userId, {
    ...claims,
    marketplace_account_ids: explicit.filter((id) => id !== String(marketplaceAccountId)),
  });
}
