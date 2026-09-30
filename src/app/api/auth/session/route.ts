import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/security/require-auth";
import { hasAdministrationRole } from "@/lib/security/admin-authorization";
import { canWriteCompanySettings } from "@/lib/security/company-settings-authorization";
import { readTenantClaims } from "@/lib/security/tenant-membership";
import { AuthServiceUnavailable } from "@/lib/security/auth-unavailable";

export const dynamic = "force-dynamic";

/** Session introspection for smoke tests — never returns secrets. */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { authenticated: false, error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const claims = readTenantClaims(user);
    return NextResponse.json({
      authenticated: true,
      permissions: {
        administration: hasAdministrationRole(user),
        companySettings: canWriteCompanySettings(user),
      },
      user: {
        id: user.id,
        email: user.email ?? null,
        role: claims.role ?? null,
      },
    });
  } catch (error) {
    if (!(error instanceof AuthServiceUnavailable)) throw error;
    return NextResponse.json({ error: "Service unavailable", code: "AUTH_UNAVAILABLE" }, { status: 503 });
  }
}
