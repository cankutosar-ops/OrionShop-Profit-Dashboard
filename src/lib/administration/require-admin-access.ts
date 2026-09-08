/**
 * Sprint 11.1 / 11.4 — Administration access gate.
 * Enforces the same Administration role rule as `/api/administration/*`
 * (src/lib/security/admin-authorization.ts). AuthZ tenancy remains 7.1.C.
 */

import { redirect } from "next/navigation";
import { getAuthUser, type AuthUser } from "@/lib/security/require-auth";
import { readTenantClaims } from "@/lib/security/tenant-membership";
import {
  ADMIN_ROLE_DENIAL_CODE,
  hasAdministrationRole,
} from "@/lib/security/admin-authorization";
import { ACCESS_DENIED_PATH } from "@/lib/security/page-scope";
import { platformRoleLabel } from "@/lib/security/roles";

export type AdminAccessContext = {
  user: AuthUser;
  /** Platform roles from orion claims (Sprint 11.4). */
  roles: string[];
};

export type AdminAccessOptions = {
  /**
   * Optional soft hint — not enforced as a new permission model.
   * Reserved for future hardening; the role gate itself is role-based.
   */
  requiredRoles?: readonly string[];
};

/**
 * Server-side gate for Administration routes.
 * Redirects unauthenticated users to login and non-administrators to /access-denied.
 */
export async function requireAdminAccess(
  options: AdminAccessOptions = {}
): Promise<AdminAccessContext> {
  void options.requiredRoles;

  const user = await getAuthUser();
  if (!user) {
    redirect("/login?next=%2Fadministration");
  }

  if (!hasAdministrationRole(user)) {
    redirect(`${ACCESS_DENIED_PATH}?code=${ADMIN_ROLE_DENIAL_CODE}`);
  }

  const claims = readTenantClaims(user);
  const roles = claims.role ? [platformRoleLabel(claims.role)] : [];

  return { user, roles };
}
