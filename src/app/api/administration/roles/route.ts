/**
 * Sprint 11.4 — Platform roles catalog (display only; no new permission model).
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";
import { listPlatformRoles } from "@/services/administration-user-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (isAuthFailure(auth)) return auth;

    return NextResponse.json({
      roles: listPlatformRoles(),
      note: "Roles are claim metadata for Administration. Authorization remains tenant membership (7.1.C).",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list roles";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
