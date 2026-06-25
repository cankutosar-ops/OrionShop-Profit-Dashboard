import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireSupabaseEnv } from "./env";

/** Server-side Supabase client with write access for sync jobs. */
export function createAdminClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const key =
    serviceKey && serviceKey !== "your-service-role-key" ? serviceKey : anonKey;

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
