import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request): string | null {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    if (!["http:", "https:"].includes(origin.protocol)) return null;
    if (origin.host !== request.headers.get("host")) return null;
    return origin.origin;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const origin = sameOrigin(request);
  if (!origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!name || name.length > 120 || !email.includes("@") || email.length > 320 || password.length < 8 || password.length > 256) {
    return NextResponse.json({ error: "Enter a valid name, email and password of at least 8 characters." }, { status: 400 });
  }
  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/settings/companies")}`,
    },
  });
  if (error) {
    const status = error.status === 429 ? 429 : 400;
    return NextResponse.json({ error: status === 429 ? "Too many signup attempts. Please wait and try again." : error.message }, { status });
  }
  return NextResponse.json(
    { ok: true, authenticated: !!data.session, requiresEmailConfirmation: !data.session },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
