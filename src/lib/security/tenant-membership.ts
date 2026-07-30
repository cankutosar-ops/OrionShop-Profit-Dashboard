/**
 * Sprint 7.1.C — Tenant membership claims (no RLS).
 *
 * Source of truth: Supabase Auth `app_metadata.orion` (service-role writable only).
 * Never trust client body/query/headers for membership.
 */

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export const ORION_TENANT_METADATA_KEY = "orion";

export type OrionTenantClaims = {
  /** Allowed company (organization) IDs for this user. */
  company_ids: string[];
  /**
   * Optional tighter account allow-list.
   * When omitted/empty, all marketplace accounts under `company_ids` are allowed.
   */
  marketplace_account_ids?: string[];
};

export type ResolvedTenantMembership = {
  companyIds: string[];
  marketplaceAccountIds: string[];
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

/** Read raw tenant claims from the authenticated user (session JWT / getUser). */
export function readTenantClaims(user: User): OrionTenantClaims {
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const orion = (meta[ORION_TENANT_METADATA_KEY] ?? meta.tenant ?? null) as
    | Record<string, unknown>
    | null;

  if (!orion || typeof orion !== "object") {
    return { company_ids: [] };
  }

  return {
    company_ids: asStringArray(orion.company_ids ?? orion.companyIds),
    marketplace_account_ids: asStringArray(
      orion.marketplace_account_ids ?? orion.marketplaceAccountIds
    ),
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

  // Explicit IDs that don't belong to allowed companies are dropped (fail closed).
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

/** Persist/replace orion tenant claims on a user (admin only). */
export async function setUserTenantClaims(
  userId: string,
  claims: OrionTenantClaims
): Promise<void> {
  const supabase = createAdminClient();
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError) throw new Error(`Failed to load user: ${getError.message}`);

  const prev = (existing.user?.app_metadata ?? {}) as Record<string, unknown>;
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...prev,
      [ORION_TENANT_METADATA_KEY]: {
        company_ids: asStringArray(claims.company_ids),
        ...(claims.marketplace_account_ids && claims.marketplace_account_ids.length > 0
          ? { marketplace_account_ids: asStringArray(claims.marketplace_account_ids) }
          : {}),
      },
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
  const company_ids = [...new Set([...claims.company_ids, companyId])];
  await setUserTenantClaims(userId, {
    company_ids,
    marketplace_account_ids: claims.marketplace_account_ids,
  });
}
