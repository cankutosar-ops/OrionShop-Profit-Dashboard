export { getSupabaseEnv, requireSupabaseEnv } from "./env";
export { createServerClient, type SupabaseClient } from "./server";
export { createBrowserClient } from "./browser";

// Backward-compatible default export path
export { createServerClient as createClient } from "./server";
