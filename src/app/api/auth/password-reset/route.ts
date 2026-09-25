import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

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
  if (!email || email.length > 320 || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm`,
  });

  if (error?.status === 429) {
    return NextResponse.json(
      { error: "Too many reset requests. Please wait and try again." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
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
