import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

/** Clear the authenticated session cookies. */
export async function POST(request: Request) {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
