/**
 * Sprint 7.1.B — Cookie-aware Supabase Auth client for Server Components / Route Handlers.
 * Uses the anon key + HttpOnly auth cookies. Not the service_role data plane.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseEnv } from "./env";
import { authCookieOptions } from "./auth-cookie-options";

export async function createAuthServerClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component without mutable cookies — middleware refresh handles it.
        }
      },
    },
  });
}
