import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import {
  clientIpFromRequest,
  deviceFromRequest,
  maskIp,
  newCorrelationId,
  recordAuditEvent,
  recordPlatformSecurityEvent,
} from "@/services/administration-audit-service";

export const dynamic = "force-dynamic";

async function readCredentials(request: Request): Promise<{ email: string; password: string }> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { email?: string; password?: string };
    return { email: body.email?.trim() ?? "", password: body.password ?? "" };
  }
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    return {
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };
  }
  // Fallback: try JSON, then empty
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    return { email: body.email?.trim() ?? "", password: body.password ?? "" };
  } catch {
    return { email: "", password: "" };
  }
}

/**
 * Password sign-in — sets Supabase Auth cookies via the server (HttpOnly).
 * Never trusts client-supplied user identity; only email/password credentials.
 */
export async function POST(request: Request) {
  const { email, password } = await readCredentials(request);
  const contentType = request.headers.get("content-type") || "";
  const wantsJson =
    (request.headers.get("accept") || "").includes("application/json") ||
    contentType.includes("application/json");

  if (!email || !password) {
    if (wantsJson) {
      return NextResponse.json(
        { error: "email and password are required", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }
    return NextResponse.redirect(new URL("/login?error=missing", request.url), 303);
  }

  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const device = deviceFromRequest(request);
  const ipMasked = maskIp(clientIpFromRequest(request));

  if (error || !data.user) {
    const correlationId = newCorrelationId();
    void recordAuditEvent({
      userEmail: email,
      module: "authentication",
      action: "login_failure",
      result: "failure",
      eventKind: "login",
      correlationId,
      device,
      ipMasked,
    });
    void recordPlatformSecurityEvent({
      userEmail: email,
      module: "authentication",
      action: "login_failure",
      result: "failure",
      correlationId,
      device,
      ipMasked,
    });
    if (wantsJson) {
      return NextResponse.json(
        {
          error: "Invalid email or password",
          code: "AUTH_INVALID_CREDENTIALS",
          message: error?.message ?? "Sign-in failed",
        },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), 303);
  }

  void recordAuditEvent({
    userId: data.user.id,
    userEmail: data.user.email ?? email,
    module: "authentication",
    action: "login_success",
    result: "success",
    eventKind: "login",
    correlationId: newCorrelationId(),
    device,
    ipMasked,
  });

  if (wantsJson) {
    return NextResponse.json({
      authenticated: true,
      user: { id: data.user.id, email: data.user.email ?? null },
    });
  }

  return NextResponse.redirect(new URL("/", request.url), 303);
}
