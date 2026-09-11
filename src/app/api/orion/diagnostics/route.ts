/**
 * Orion retrieval diagnostics — read-only (Sprint 12.8).
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";
import { getOrionDiagnostics } from "@/services/orion-knowledge-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (isAuthFailure(auth)) return auth;

  return NextResponse.json(getOrionDiagnostics());
}
