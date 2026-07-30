/**
 * Sprint 7.1.B — Middleware session refresh + auth gate.
 * Keeps 7.1.A containment. Does not implement authorization/roles.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  applyContainmentCookie,
  hasContainmentAccess,
  containmentUnauthorizedResponse,
  CONTAINMENT_HEADER,
} from "@/lib/security/containment-gate";
import { isAuthPublicPath } from "@/lib/security/auth-paths";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { tryResolveInternalApiSecret } from "@/lib/security/secrets";

function isInternalBearer(request: NextRequest): boolean {
  const secret = tryResolveInternalApiSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const custom = request.headers.get(CONTAINMENT_HEADER)?.trim();
  return bearer === secret || custom === secret;
}

async function withAuthSession(request: NextRequest): Promise<{
  response: NextResponse;
  userId: string | null;
}> {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const env = getSupabaseEnv();
  if (!env.isConfigured) {
    return { response, userId: null };
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates JWT with the Auth server (rejects tampered/expired sessions).
  const { data } = await supabase.auth.getUser();
  return { response, userId: data.user?.id ?? null };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(?:ico|png|jpg|jpeg|svg|webp|css|js|map|txt)$/)
  ) {
    return NextResponse.next();
  }

  const { response, userId } = await withAuthSession(request);
  const isPublic = isAuthPublicPath(pathname);
  const internal = isInternalBearer(request);

  if (pathname.startsWith("/api/")) {
    if (
      process.env.NODE_ENV === "production" &&
      (pathname.startsWith("/api/perf/") || pathname === "/api/perf")
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Public auth API endpoints still mint containment cookie but skip user gate.
    if (!isPublic) {
      if (!(await hasContainmentAccess(request))) {
        return containmentUnauthorizedResponse();
      }
      if (!userId && !internal) {
        return NextResponse.json(
          {
            error: "Unauthorized",
            code: "AUTH_REQUIRED",
            message: "Valid authenticated session required.",
          },
          { status: 401 }
        );
      }
    }

    return applyContainmentCookie(response, request);
  }

  // Document navigations
  if (!isPublic && !userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(loginUrl);
    return applyContainmentCookie(redirect, request);
  }

  // Authenticated user on /login → home
  if (userId && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    const redirect = NextResponse.redirect(home);
    return applyContainmentCookie(redirect, request);
  }

  return applyContainmentCookie(response, request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
