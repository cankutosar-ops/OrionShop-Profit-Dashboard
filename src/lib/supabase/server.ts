import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireSupabaseEnv } from "./env";

export function createServerClient() {
  const { url, anonKey } = requireSupabaseEnv();

  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SupabaseClient = ReturnType<typeof createServerClient>;
