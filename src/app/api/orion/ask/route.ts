/**
 * Orion Assistant ask — read-only (Sprint 12.8/12.9).
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";
import { askOrion } from "@/services/orion-knowledge-service";
import type { OrionAskContext } from "@/lib/orion/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (isAuthFailure(auth)) return auth;

  let body: { question?: string; context?: OrionAskContext };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const answer = askOrion(question, body.context);
  return NextResponse.json(answer);
}
