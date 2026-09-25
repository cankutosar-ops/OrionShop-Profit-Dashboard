import { NextResponse } from "next/server";
import type { AuthUser } from "@/lib/security/require-auth";
import { readTenantClaims } from "@/lib/security/tenant-membership";
import type { PlatformRole } from "@/lib/security/roles";

const COMPANY_SETTINGS_WRITE_ROLES: readonly PlatformRole[] = [
  "administrator",
  "manager",
];

export function canWriteCompanySettings(user: AuthUser): boolean {
  if (user.id === "service:internal") return true;
  const role = readTenantClaims(user).role;
  return !!role && COMPANY_SETTINGS_WRITE_ROLES.includes(role);
}

export function companySettingsWriteForbiddenResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Forbidden",
      code: "AUTHZ_COMPANY_SETTINGS_WRITE_REQUIRED",
      message: "Company tax and marketplace settings require an administrator or manager role.",
    },
    { status: 403 }
  );
}
