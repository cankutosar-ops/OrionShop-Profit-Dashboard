/**
 * Orion Knowledge relationships — read-only (Sprint 12.8).
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";
import { getKnowledgeRelationships, isKnowledgeAccessible } from "@/services/orion-knowledge-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (isAuthFailure(auth)) return auth;

  const { id } = await params;
  if (!isKnowledgeAccessible(auth.id, id)) {
    return NextResponse.json({ error: "Knowledge not accessible" }, { status: 403 });
  }

  const url = new URL(request.url);
  const direction = (url.searchParams.get("direction") ?? "both") as "outbound" | "inbound" | "both";
  const maxDepth = Number(url.searchParams.get("depth") ?? "2");

  const traversal = getKnowledgeRelationships(id, { direction, max_depth: maxDepth });
  return NextResponse.json(traversal);
}
