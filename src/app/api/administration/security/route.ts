/**
 * Sprint 11.5 — Security overview / Auth / AuthZ / RLS / Secrets (read-only).
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";
import {
  assertSecurityPayloadSafe,
  getSecurityBundle,
} from "@/services/administration-security-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (isAuthFailure(auth)) return auth;

    const bundle = await getSecurityBundle();
    const payload = { ...bundle };
    assertSecurityPayloadSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load security status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
