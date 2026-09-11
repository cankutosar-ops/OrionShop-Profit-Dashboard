/**
 * Orion Knowledge search — read-only (Sprint 12.8).
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";
import { searchKnowledge } from "@/services/orion-knowledge-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (isAuthFailure(auth)) return auth;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const contextModule = url.searchParams.get("module") ?? undefined;
  const route = url.searchParams.get("route") ?? undefined;

  const result = searchKnowledge(q, { module: contextModule, route });
  return NextResponse.json(result);
}
