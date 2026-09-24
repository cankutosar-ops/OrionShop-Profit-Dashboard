import { NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/auth-server';
import { authRedirectUrl } from '@/lib/security/auth-redirect-url';

export const dynamic = 'force-dynamic';

/** Email templates send the one-time hash here; never forward it to another page. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  let destination = '/login?error=confirmation_failed';
  if (tokenHash && (type === 'invite' || type === 'recovery')) {
    const supabase = await createAuthServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) destination = '/auth/password';
  }
  const response = NextResponse.redirect(authRedirectUrl(destination, url.origin));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
