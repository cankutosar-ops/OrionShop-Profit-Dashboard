import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/security/require-auth";
import { hasAdministrationRole } from "@/lib/security/admin-authorization";
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
    return NextResponse.json({
      authenticated: true,
      permissions: { administration: hasAdministrationRole(user) },
      user: {
        id: user.id,
        email: user.email ?? null,
      },
    });
  } catch (error) {
    if (!(error instanceof AuthServiceUnavailable)) throw error;
    return NextResponse.json({ error: "Service unavailable", code: "AUTH_UNAVAILABLE" }, { status: 503 });
  }
}
