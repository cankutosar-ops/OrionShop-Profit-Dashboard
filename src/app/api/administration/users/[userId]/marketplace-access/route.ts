/**
 * Sprint 11.4 — Marketplace access grant/revoke (orion claims).
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";
import {
  assertNoCredentialsInPayload,
  setUserMarketplaceAccess,
} from "@/services/administration-user-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (isAuthFailure(auth)) return auth;

    const { userId } = await context.params;
    const body = (await request.json()) as {
      marketplaceAccountId?: string;
      granted?: boolean;
    };

    if (!body.marketplaceAccountId?.trim()) {
      return NextResponse.json(
        { error: "marketplaceAccountId is required" },
        { status: 400 }
      );
    }
    if (typeof body.granted !== "boolean") {
      return NextResponse.json({ error: "granted boolean is required" }, { status: 400 });
    }

    const user = await setUserMarketplaceAccess(
      userId,
      body.marketplaceAccountId,
      body.granted
    );
    const payload = { user };
    assertNoCredentialsInPayload(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update marketplace access";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
