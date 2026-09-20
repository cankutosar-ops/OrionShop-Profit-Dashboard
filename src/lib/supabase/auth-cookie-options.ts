import type { CookieOptions } from '@supabase/ssr';

/** Auth is server-owned: browser components use application routes, not tokens. */
export function authCookieOptions(): CookieOptions {
  return {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  };
}
