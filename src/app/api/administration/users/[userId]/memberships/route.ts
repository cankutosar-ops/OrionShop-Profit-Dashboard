/**
 * Sprint 11.4 — Company membership add/remove.
 */

import { NextResponse } from "next/server";
import { requireAdminApi, isAdminAuthFailure } from "@/lib/security/admin-authorization";
import {
  addUserMembership,
  assertNoCredentialsInPayload,
  removeUserMembership,
} from "@/services/administration-user-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ userId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminApi(request);
    if (isAdminAuthFailure(auth)) return auth;

    const { userId } = await context.params;
    const body = (await request.json()) as { companyId?: string };
    if (!body.companyId?.trim()) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const user = await addUserMembership(userId, body.companyId);
    const payload = { user };
    assertNoCredentialsInPayload(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add membership";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminApi(request);
    if (isAdminAuthFailure(auth)) return auth;

    const { userId } = await context.params;
    const companyId = new URL(request.url).searchParams.get("companyId");

    if (!companyId?.trim()) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const user = await removeUserMembership(userId, companyId);
    const payload = { user };
    assertNoCredentialsInPayload(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove membership";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
