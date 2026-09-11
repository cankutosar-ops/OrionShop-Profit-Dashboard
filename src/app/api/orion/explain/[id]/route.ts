/**
 * Orion Knowledge explanation — read-only (Sprint 12.8).
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";
import { explainKnowledge, isKnowledgeAccessible } from "@/services/orion-knowledge-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (isAuthFailure(auth)) return auth;

  const { id } = await params;
  if (!isKnowledgeAccessible(auth.id, id)) {
    return NextResponse.json({ error: "Knowledge not accessible" }, { status: 403 });
  }

  const explanation = explainKnowledge(id);
  if (!explanation) {
    return NextResponse.json({ error: "Knowledge object not found" }, { status: 404 });
  }

  return NextResponse.json(explanation);
}
