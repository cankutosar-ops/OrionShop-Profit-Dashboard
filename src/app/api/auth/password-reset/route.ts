import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameOriginFromRequest(request: Request): string | null {
  const origin = request.headers.get("origin");
  try {
    const source = new URL(origin ?? "");
    if (!["https:", "http:"].includes(source.protocol)) return null;
    if (source.host !== request.headers.get("host")) return null;
    return source.origin;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const origin = sameOriginFromRequest(request);
  if (!origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const requestId = crypto.randomUUID();
  let stage = "client_configuration";
  const unavailable = () => NextResponse.json(
    { error: "Password reset is temporarily unavailable. Please contact support with the reference below.", requestId },
    { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } }
  );
  try {
    const supabase = await createAuthServerClient();
    stage = "recovery_request";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/confirm`,
    });

    if (error?.status === 429) {
      return NextResponse.json(
        { error: "Too many reset requests. Please wait and try again." },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (error) {
      console.error("[auth/password-reset] unavailable", { requestId, stage, status: error.status });
      return unavailable();
    }
  } catch {
    // Never log email addresses, provider messages, headers or credentials.
    console.error("[auth/password-reset] unavailable", { requestId, stage });
    return unavailable();
  }

  // Keep account existence private. Supabase sends mail only for eligible users.
  return NextResponse.json(
    {
      ok: true,
      message: "If an account exists for this email, a password reset link has been sent.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
