import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireSupabaseEnv } from "./env";
import { supabaseFetch } from "./fetch";

/**
 * Server-side Supabase client with service_role (bypasses RLS).
 * Sprint 7.1.D — keep only for sync, lifecycle, credentials, membership admin,
 * and other documented exceptions. Prefer createServerClient() (user JWT + RLS)
 * for request-scoped reads/writes.
 */
export function createAdminClient() {
  const { url } = requireSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceKey || serviceKey === "your-service-role-key") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for server-side database access (Sprint 7.1.A containment). Anon fallback is disabled."
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: supabaseFetch },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
