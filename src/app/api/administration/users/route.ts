/**
 * Sprint 11.4 — Administration Users API (list + invite).
 * Reuses requireAuth (7.1.B). Tenant mutations go through administration-user-service → orion claims (7.1.C).
 */

import { NextResponse } from "next/server";
import { requireAdminApi, isAdminAuthFailure } from "@/lib/security/admin-authorization";
import { normalizePlatformRole } from "@/lib/security/roles";
import {
  assertNoCredentialsInPayload,
  inviteManagedUser,
  listManagedUsers,
} from "@/services/administration-user-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApi(request);
    if (isAdminAuthFailure(auth)) return auth;

    const users = await listManagedUsers();
    const payload = { users };
    assertNoCredentialsInPayload(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list users";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi(request);
    if (isAdminAuthFailure(auth)) return auth;

    const body = (await request.json()) as {
      email?: string;
      name?: string;
      companyId?: string;
      role?: string;
      reason?: string;
    };

    const role = normalizePlatformRole(body.role);
    if (!role) {
      return NextResponse.json({ error: "Valid role is required" }, { status: 400 });
    }
    if (!body.email?.trim()) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    if (!body.companyId?.trim()) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const user = await inviteManagedUser({
      email: body.email,
      name: body.name,
      companyId: body.companyId,
      role,
      redirectTo: `${origin}/auth/callback`,
    });

    const { newCorrelationId, recordAuditEvent } = await import(
      "@/services/administration-audit-service"
    );
    void recordAuditEvent({
      userId: auth.id,
      userEmail: auth.email ?? null,
      companyId: body.companyId,
      module: "users",
      action: "invite_user",
      entityType: "user",
      entityId: user.id,
      result: "success",
      eventKind: "audit",
      reason: body.reason?.trim() || null,
      correlationId: newCorrelationId(),
      metadata: { invitedEmail: user.email, role },
    });

    const payload = { user };
    assertNoCredentialsInPayload(payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to invite user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
