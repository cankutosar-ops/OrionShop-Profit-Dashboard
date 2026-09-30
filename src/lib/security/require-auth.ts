/**
 * Sprint 7.1.B — Authentication helpers (identity only; no roles/authorization).
 * Sprint 7.1.D — also binds request DB context (JWT vs service_role).
 */

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { CONTAINMENT_HEADER } from "@/lib/security/containment-gate";
import {
  enterServiceDbContext,
  enterUserDbContext,
} from "@/lib/supabase/request-db-context";
import { tryResolveInternalApiSecret } from "@/lib/security/secrets";
import { withReadBudget, ReadBudgetExceeded } from "@/lib/supabase/read-budget";
import { AUTH_CHECK_TIMEOUT_MS, AuthServiceUnavailable, isAuthServiceFailure } from "./auth-unavailable";

export type AuthUser = User;

export function authUnauthorizedResponse(message = "Authentication required") {
  return NextResponse.json(
    {
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
      message,
    },
    { status: 401 }
  );
}

function internalSecret(): string {
  return tryResolveInternalApiSecret() ?? "";
}

/** Trusted CLI / server→self Bearer — not an end-user session. */
export function isInternalServiceRequest(request: Request): boolean {
  const secret = internalSecret();
  if (!secret || secret === "your-service-role-key") return false;
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const custom = request.headers.get(CONTAINMENT_HEADER)?.trim();
  return bearer === secret || custom === secret;
}

/** Read the authenticated user from HttpOnly Supabase Auth cookies. Never trust the body. */
export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const { data, error } = await withReadBudget(async () => {
      const supabase = await createAuthServerClient();
      return supabase.auth.getUser();
    }, AUTH_CHECK_TIMEOUT_MS);
    if (isAuthServiceFailure(error)) throw new AuthServiceUnavailable();
    if (error || !data.user) return null;
    return data.user;
  } catch (error) {
    if (error instanceof AuthServiceUnavailable || error instanceof ReadBudgetExceeded) throw new AuthServiceUnavailable();
    return null;
  }
}

/**
 * Route-handler guard: returns 401 Response when unauthenticated.
 * Internal service Bearer is allowed for trusted server→self / CLI calls.
 * Binds Sprint 7.1.D DB context (service vs user JWT).
 */
export async function requireAuth(request: Request): Promise<AuthUser | NextResponse> {
  if (isInternalServiceRequest(request)) {
    enterServiceDbContext("internal-bearer");
    return {
      id: "service:internal",
      aud: "authenticated",
      role: "service_role",
      email: undefined,
      app_metadata: { provider: "internal" },
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    } as AuthUser;
  }

  try {
    const { data, error, accessToken } = await withReadBudget(async () => {
      const supabase = await createAuthServerClient();
      const result = await supabase.auth.getUser();
      if (result.error || !result.data.user) return { ...result, accessToken: undefined };
      const { data: sessionData } = await supabase.auth.getSession();
      return { ...result, accessToken: sessionData.session?.access_token };
    }, AUTH_CHECK_TIMEOUT_MS);
    if (isAuthServiceFailure(error)) throw new AuthServiceUnavailable();
    if (error || !data.user) return authUnauthorizedResponse();

    if (accessToken) {
      enterUserDbContext(accessToken);
    }

    return data.user;
  } catch (error) {
    if (error instanceof AuthServiceUnavailable || error instanceof ReadBudgetExceeded) {
      return NextResponse.json({ error: "Service unavailable", code: "AUTH_UNAVAILABLE" }, { status: 503 });
    }
    return authUnauthorizedResponse();
  }
}

export function isAuthFailure(value: AuthUser | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
