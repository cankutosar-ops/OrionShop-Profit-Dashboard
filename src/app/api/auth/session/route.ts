import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/security/require-auth";

export const dynamic = "force-dynamic";

/** Session introspection for smoke tests — never returns secrets. */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { authenticated: false, error: "Unauthorized", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
  });
}
