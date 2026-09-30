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
import { authCookieOptions } from "@/lib/supabase/auth-cookie-options";
import { fetchWithSignal } from "@/lib/supabase/fetch-with-signal";
import { withOperationTimeout } from "@/lib/operation-timeout";
import { AUTH_CHECK_TIMEOUT_MS, isAuthServiceFailure } from "@/lib/security/auth-unavailable";
import {
  isCommercialContinuityCronRequest,
  tryResolveInternalApiSecret,
} from "@/lib/security/secrets";

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
  unavailable?: boolean;
}> {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const env = getSupabaseEnv();
  if (!env.isConfigured) {
    return { response, userId: null };
  }

  try {
    return await withOperationTimeout(async (signal) => {
      const supabase = createServerClient(env.url, env.anonKey, {
        global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetchWithSignal(input, init, [signal]) },
        cookieOptions: authCookieOptions(),
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
      const { data, error } = await supabase.auth.getUser();
      if (isAuthServiceFailure(error)) return { response, userId: null, unavailable: true };
      return { response, userId: data.user?.id ?? null };
    }, AUTH_CHECK_TIMEOUT_MS);
  } catch {
    return { response, userId: null, unavailable: true };
  }
}

export async function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  request.headers.set("x-orion-request-id", requestId);
  const result = await handleMiddleware(request);
  result.headers.set("x-orion-request-id", requestId);
  return result;
}

async function handleMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname === "/service-unavailable" ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(?:ico|png|jpg|jpeg|svg|webp|css|js|map|txt)$/)
  ) {
    return NextResponse.next();
  }

  const { response, userId, unavailable } = await withAuthSession(request);
  const isPublic = isAuthPublicPath(pathname);
  const internal = isInternalBearer(request);
  const commercialCron = isCommercialContinuityCronRequest(request);

  // A temporary Auth failure is not evidence that the user signed out.
  // Never allow tenant data through, or redirect a valid session into a loop.
  if (unavailable && !internal && !commercialCron) {
    console.warn("[auth-unavailable]", { requestId: request.headers.get("x-orion-request-id"), stage: "middleware" });
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Service unavailable", code: "AUTH_UNAVAILABLE" }, {
        status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "10" },
      });
    }
    const target = request.nextUrl.clone();
    target.pathname = "/service-unavailable";
    target.search = "";
    // Preserve a valid Flight response on soft navigation. The error page
    // resolves normally; API clients receive a 503 above.
    const result = NextResponse.rewrite(target, { request: { headers: request.headers } });
    result.headers.set("Cache-Control", "private, no-store");
    result.headers.set("Retry-After", "10");
    return result;
  }

  if (pathname.startsWith("/api/")) {
    if (
      process.env.NODE_ENV === "production" &&
      (pathname.startsWith("/api/perf/") || pathname === "/api/perf")
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Public auth API endpoints still mint containment cookie but skip user gate.
    if (!isPublic) {
      if (!commercialCron && !(await hasContainmentAccess(request))) {
        return containmentUnauthorizedResponse();
      }
      if (!userId && !internal && !commercialCron) {
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
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return applyContainmentCookie(redirect, request);
  }

  // Authenticated user on a guest-only auth screen → home
  if (userId && (pathname === "/login" || pathname === "/signup")) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    const redirect = NextResponse.redirect(home);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return applyContainmentCookie(redirect, request);
  }

  return applyContainmentCookie(response, request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
