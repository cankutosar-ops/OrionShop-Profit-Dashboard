import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { safeAuthRedirect } from "@/lib/security/safe-auth-redirect";

export const dynamic = "force-dynamic";

/**
 * OAuth / magic-link callback — exchanges code for a session cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const safeNext = safeAuthRedirect(url.searchParams.get("next"));

  if (code) {
    const supabase = await createAuthServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/login?error=callback_failed', url.origin));
    }
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
