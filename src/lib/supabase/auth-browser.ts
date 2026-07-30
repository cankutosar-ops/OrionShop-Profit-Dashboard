/**
 * Sprint 7.1.B — Cookie-aware Supabase Auth client for the browser.
 * Separate from createServerClient() (request JWT / RLS data plane).
 */

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "./env";

export function createAuthBrowserClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
