/**
 * Sprint 11.4 — Administration user detail + profile/role/status updates.
 */

import { NextResponse } from "next/server";
import { requireAdminApi, isAdminAuthFailure } from "@/lib/security/admin-authorization";
import { normalizePlatformRole } from "@/lib/security/roles";
import {
  assertNoCredentialsInPayload,
  getManagedUser,
  setManagedUserDisabled,
  updateManagedUser,
} from "@/services/administration-user-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminApi(request);
    if (isAdminAuthFailure(auth)) return auth;

    const { userId } = await context.params;
    const user = await getManagedUser(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const payload = { user };
    assertNoCredentialsInPayload(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminApi(request);
    if (isAdminAuthFailure(auth)) return auth;

    const { userId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      role?: string;
      disabled?: boolean;
    };

    if (typeof body.disabled === "boolean") {
      const user = await setManagedUserDisabled(userId, body.disabled);
      const payload = { user };
      assertNoCredentialsInPayload(payload);
      return NextResponse.json(payload);
    }

    const name = body.name;
    let role: ReturnType<typeof normalizePlatformRole> | undefined;
    if (body.role !== undefined) {
      role = normalizePlatformRole(body.role);
      if (!role) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
    }

    if (name === undefined && role === undefined) {
      return NextResponse.json({ error: "No supported fields to update" }, { status: 400 });
    }

    const user = await updateManagedUser(userId, {
      name,
      role: role ?? undefined,
    });
    const payload = { user };
    assertNoCredentialsInPayload(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
