import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireSupabaseEnv } from "./env";

export function createBrowserClient() {
  const { url, anonKey } = requireSupabaseEnv();

  return createClient<Database>(url, anonKey);
}
