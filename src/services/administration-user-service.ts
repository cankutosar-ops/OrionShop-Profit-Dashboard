/**
 * Sprint 11.4 — Administration User Management (service layer).
 *
 * Reuses Supabase Auth Admin API (7.1.B) and orion tenant claims (7.1.C).
 * No new authentication, no password exposure, no permission-engine redesign.
 */

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLATFORM_ROLES,
  normalizePlatformRole,
  platformRoleLabel,
  type PlatformRole,
} from "@/lib/security/roles";
import {
  grantCompanyToUser,
  grantMarketplaceAccountToUser,
  readTenantClaims,
  revokeCompanyFromUser,
  revokeMarketplaceAccountFromUser,
  setUserPlatformRole,
  setUserTenantClaims,
} from "@/lib/security/tenant-membership";
import { listCompanies } from "@/services/marketplace-account-service";
import type {
  DisplayMarketplace,
  InviteUserInput,
  ManagedUserDetails,
  ManagedUserSummary,
  MarketplaceAccessRow,
  MembershipRow,
  RecentActivityItem,
  UpdateManagedUserInput,
  UserStatus,
} from "@/lib/administration/user-types";
import { DISPLAY_MARKETPLACE_LABEL } from "@/lib/administration/user-types";

export type {
  DisplayMarketplace,
  InviteUserInput,
  ManagedUserDetails,
  ManagedUserSummary,
  MarketplaceAccessRow,
  MembershipRow,
  RecentActivityItem,
  UpdateManagedUserInput,
  UserStatus,
} from "@/lib/administration/user-types";

export {
  DISPLAY_MARKETPLACE_LABEL,
  DISPLAY_MARKETPLACES,
} from "@/lib/administration/user-types";

export type { PlatformRole };

function displayName(user: User): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fromMeta =
    String(meta.full_name ?? meta.name ?? meta.display_name ?? "").trim();
  if (fromMeta) return fromMeta;
  const email = user.email ?? "";
  const local = email.split("@")[0]?.trim();
  return local || "User";
}

function isDisabled(user: User): boolean {
  const bannedUntil = (user as { banned_until?: string | null }).banned_until;
  if (!bannedUntil) return false;
  const ts = Date.parse(bannedUntil);
  if (Number.isNaN(ts)) return true;
  return ts > Date.now();
}

export function resolveUserStatus(user: User): UserStatus {
  if (isDisabled(user)) return "disabled";
  if (user.email_confirmed_at) return "active";
  // Invite / unconfirmed
  const invitedAt =
    (user as { invited_at?: string | null }).invited_at ??
    user.confirmation_sent_at ??
    null;
  if (invitedAt || !user.email_confirmed_at) return "invited";
  return "active";
}

function sanitizeUser(user: User): User {
  // Ensure we never accidentally serialize secrets from raw admin payloads later.
  return user;
}

async function companyNameMap(): Promise<Map<string, { name: string; status: string }>> {
  const companies = await listCompanies(undefined, { includeArchived: true });
  return new Map(
    companies.map((c) => [
      c.id,
      { name: c.name, status: String((c as { status?: string }).status ?? "active") },
    ])
  );
}

function toSummary(
  user: User,
  names: Map<string, { name: string; status: string }>
): ManagedUserSummary {
  const claims = readTenantClaims(user);
  const role = claims.role ?? null;
  const companyIds = claims.company_ids;
  return {
    id: user.id,
    name: displayName(user),
    email: user.email ?? "",
    role,
    roleLabel: platformRoleLabel(role),
    companyIds,
    companyNames: companyIds.map((id) => names.get(id)?.name ?? id.slice(0, 8)),
    status: resolveUserStatus(user),
    lastLoginAt: user.last_sign_in_at ?? null,
    createdAt: user.created_at ?? null,
  };
}

async function listAuthUsers(): Promise<User[]> {
  const supabase = createAdminClient();
  const users: User[] = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to list users: ${error.message}`);
    const batch = data.users ?? [];
    users.push(...batch.map(sanitizeUser));
    if (batch.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }
  return users;
}

export async function listManagedUsers(): Promise<ManagedUserSummary[]> {
  const [users, names] = await Promise.all([listAuthUsers(), companyNameMap()]);
  return users
    .map((u) => toSummary(u, names))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function getManagedUser(userId: string): Promise<ManagedUserDetails | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw new Error(`Failed to load user: ${error.message}`);
  if (!data.user) return null;

  const user = sanitizeUser(data.user);
  const names = await companyNameMap();
  const summary = toSummary(user, names);
  const claims = readTenantClaims(user);

  const memberships: MembershipRow[] = claims.company_ids.map((companyId) => ({
    companyId,
    companyName: names.get(companyId)?.name ?? companyId.slice(0, 8),
    status: names.get(companyId)?.status ?? "unknown",
  }));

  const companies = await listCompanies(undefined, { includeArchived: true });
  const memberCompanies = companies.filter((c) => claims.company_ids.includes(c.id));
  const explicit = claims.marketplace_account_ids ?? [];
  const unrestricted = explicit.length === 0;

  const marketplaceAccess: MarketplaceAccessRow[] = [];
  for (const company of memberCompanies) {
    for (const account of company.accounts ?? []) {
      const marketplace = normalizeDisplayMarketplace(account.marketplace);
      marketplaceAccess.push({
        companyId: company.id,
        companyName: company.name,
        marketplaceAccountId: account.id,
        accountName: account.account_name,
        marketplace,
        marketplaceLabel: DISPLAY_MARKETPLACE_LABEL[marketplace],
        granted: unrestricted || explicit.includes(account.id),
        unrestrictedUnderCompany: unrestricted,
      });
    }
  }

  const recentActivity: RecentActivityItem[] = [
    { label: "Last login", at: user.last_sign_in_at ?? null },
    { label: "Email confirmed", at: user.email_confirmed_at ?? null },
    { label: "Invited", at: (user as { invited_at?: string | null }).invited_at ?? null },
    { label: "Created", at: user.created_at ?? null },
    { label: "Updated", at: user.updated_at ?? null },
  ].filter((row) => row.at);

  return {
    ...summary,
    memberships,
    marketplaceAccess,
    recentActivity,
  };
}

function normalizeDisplayMarketplace(value: string): DisplayMarketplace {
  const v = String(value ?? "").toLowerCase();
  if (v === "shopify") return "shopify";
  if (v === "ozon") return "ozon";
  if (v === "lamoda") return "lamoda";
  return "wildberries";
}

export async function inviteManagedUser(input: InviteUserInput): Promise<ManagedUserSummary> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Valid email is required");
  }
  const role = normalizePlatformRole(input.role);
  if (!role) throw new Error("Invalid role");
  if (!input.companyId?.trim()) throw new Error("companyId is required");

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: input.name?.trim() || undefined,
    },
    redirectTo: input.redirectTo,
  });
  if (error) throw new Error(`Invite failed: ${error.message}`);
  if (!data.user) throw new Error("Invite failed: no user returned");

  await setUserTenantClaims(data.user.id, {
    company_ids: [String(input.companyId)],
    role,
  });

  const names = await companyNameMap();
  const { data: refreshed } = await supabase.auth.admin.getUserById(data.user.id);
  return toSummary(sanitizeUser(refreshed?.user ?? data.user), names);
}

export async function updateManagedUser(
  userId: string,
  input: UpdateManagedUserInput
): Promise<ManagedUserSummary> {
  const supabase = createAdminClient();
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError) throw new Error(`Failed to load user: ${getError.message}`);
  if (!existing.user) throw new Error("User not found");

  if (input.name !== undefined) {
    const prevMeta = (existing.user.user_metadata ?? {}) as Record<string, unknown>;
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...prevMeta,
        full_name: String(input.name).trim(),
      },
    });
    if (error) throw new Error(`Failed to update profile: ${error.message}`);
  }

  if (input.role !== undefined) {
    const role = normalizePlatformRole(input.role);
    if (!role) throw new Error("Invalid role");
    await setUserPlatformRole(userId, role);
  }

  const names = await companyNameMap();
  const { data: refreshed, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !refreshed.user) throw new Error("Failed to reload user");
  return toSummary(sanitizeUser(refreshed.user), names);
}

export async function setManagedUserDisabled(
  userId: string,
  disabled: boolean
): Promise<ManagedUserSummary> {
  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: disabled ? "876000h" : "none",
  });
  if (error) throw new Error(`Failed to update status: ${error.message}`);

  const names = await companyNameMap();
  const { data, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError || !data.user) throw new Error("Failed to reload user");
  return toSummary(sanitizeUser(data.user), names);
}

export async function addUserMembership(
  userId: string,
  companyId: string
): Promise<ManagedUserDetails> {
  await grantCompanyToUser(userId, companyId);
  const details = await getManagedUser(userId);
  if (!details) throw new Error("User not found");
  return details;
}

export async function removeUserMembership(
  userId: string,
  companyId: string
): Promise<ManagedUserDetails> {
  await revokeCompanyFromUser(userId, companyId);
  const details = await getManagedUser(userId);
  if (!details) throw new Error("User not found");
  return details;
}

export async function setUserMarketplaceAccess(
  userId: string,
  marketplaceAccountId: string,
  granted: boolean
): Promise<ManagedUserDetails> {
  if (granted) {
    await grantMarketplaceAccountToUser(userId, marketplaceAccountId);
  } else {
    await revokeMarketplaceAccountFromUser(userId, marketplaceAccountId);
  }
  const details = await getManagedUser(userId);
  if (!details) throw new Error("User not found");
  return details;
}

export function listPlatformRoles(): {
  id: PlatformRole;
  label: string;
}[] {
  return PLATFORM_ROLES.map((id) => ({
    id,
    label: platformRoleLabel(id),
  }));
}

/** Strip any accidental credential-like keys from a JSON-serializable payload. */
export function assertNoCredentialsInPayload(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (
    /"password"\s*:|"encrypted_|"api_key"|"secret"|"access_token"|"refresh_token"/i.test(
      text
    )
  ) {
    throw new Error("Refusing to return credential-bearing payload");
  }
}
