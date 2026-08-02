/**
 * Sprint 11.1 / 11.4 — Administration access gate.
 * Authenticated users only. Roles are read from orion claims for display/context;
 * AuthZ tenancy remains 7.1.C (no new permission engine).
 */

import { redirect } from "next/navigation";
import { getAuthUser, type AuthUser } from "@/lib/security/require-auth";
import { readTenantClaims } from "@/lib/security/tenant-membership";
import { platformRoleLabel } from "@/lib/security/roles";

export type AdminAccessContext = {
  user: AuthUser;
  /** Platform roles from orion claims (Sprint 11.4). */
  roles: string[];
};

export type AdminAccessOptions = {
  /**
   * Optional soft hint — not enforced as a new permission model.
   * Reserved for future hardening; 11.4 keeps auth-only gate.
   */
  requiredRoles?: readonly string[];
};

/**
 * Server-side gate for Administration routes.
 * Redirects unauthenticated users to login.
 */
export async function requireAdminAccess(
  options: AdminAccessOptions = {}
): Promise<AdminAccessContext> {
  void options.requiredRoles;

  const user = await getAuthUser();
  if (!user) {
    redirect("/login?next=%2Fadministration");
  }

  const claims = readTenantClaims(user);
  const roles = claims.role ? [platformRoleLabel(claims.role)] : [];

  return { user, roles };
}
