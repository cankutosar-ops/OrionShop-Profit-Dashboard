/**
 * Administration role enforcement.
 *
 * Uses the role model that already exists in this repository — `app_metadata.orion.role`
 * (src/lib/security/roles.ts: administrator | manager | operator | viewer). No new RBAC
 * engine, no per-endpoint permission matrix.
 *
 * Rule (deny by default): every Administration entry point requires the
 * `administrator` platform role. Administration can change other users' roles,
 * memberships and platform settings, so read/write splits across manager,
 * operator and viewer are left closed until the product decides them.
 *
 * Internal service Bearer (`INTERNAL_API_SECRET`) stays allowed: it is the
 * CLI/server→self principal already trusted by `requireAuth`.
 *
 * Bootstrap: the first administrator is granted with
 * `npm run grant:platform-role -- --email <email> --role administrator`.
 * The claim reaches the JWT on the user's next sign-in.
 */

import { NextResponse } from "next/server";
import {
  isAuthFailure,
  requireAuth,
  type AuthUser,
} from "@/lib/security/require-auth";
import { readTenantClaims } from "@/lib/security/tenant-membership";
import type { PlatformRole } from "@/lib/security/roles";

/** Roles allowed to reach Administration (read or write). */
export const ADMINISTRATION_ALLOWED_ROLES: readonly PlatformRole[] = ["administrator"];

export const ADMIN_ROLE_DENIAL_CODE = "AUTHZ_ADMIN_ROLE_REQUIRED";

export const INTERNAL_SERVICE_USER_ID = "service:internal";

/** True for the trusted CLI/server principal minted by `requireAuth`. */
export function isInternalServicePrincipal(user: AuthUser): boolean {
  return user.id === INTERNAL_SERVICE_USER_ID;
}

/** Does this principal hold an Administration role? */
export function hasAdministrationRole(user: AuthUser): boolean {
  if (isInternalServicePrincipal(user)) return true;
  const role = readTenantClaims(user).role;
  return !!role && ADMINISTRATION_ALLOWED_ROLES.includes(role);
}

export function adminRoleForbiddenResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Forbidden",
      code: ADMIN_ROLE_DENIAL_CODE,
      message: `Administration requires one of these platform roles: ${ADMINISTRATION_ALLOWED_ROLES.join(", ")}.`,
    },
    { status: 403 }
  );
}

/**
 * Route-handler guard for `/api/administration/*`.
 * 401 when unauthenticated, 403 when authenticated without an Administration role.
 */
export async function requireAdminApi(
  request: Request
): Promise<AuthUser | NextResponse> {
  const auth = await requireAuth(request);
  if (isAuthFailure(auth)) return auth;
  if (!hasAdministrationRole(auth)) return adminRoleForbiddenResponse();
  return auth;
}

export function isAdminAuthFailure(
  value: AuthUser | NextResponse
): value is NextResponse {
  return value instanceof NextResponse;
}
