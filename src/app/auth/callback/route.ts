import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { safeAuthRedirect } from "@/lib/security/safe-auth-redirect";
import { authRedirectUrl } from "@/lib/security/auth-redirect-url";

export const dynamic = "force-dynamic";

/**
 * OAuth / magic-link callback — exchanges code for a session cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const safeNext = safeAuthRedirect(url.searchParams.get("next"));
  let destination = safeNext;

  if (code) {
    const supabase = await createAuthServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      destination = '/login?error=callback_failed';
    }
  }

  const response = NextResponse.redirect(authRedirectUrl(destination, url.origin));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
