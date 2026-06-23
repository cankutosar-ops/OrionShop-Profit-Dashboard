/**
 * Supabase environment configuration.
 * Copy .env.example to .env.local and fill in your project credentials.
 */
export type SupabaseEnv = {
  url: string;
  anonKey: string;
  isConfigured: boolean;
};

const PLACEHOLDER_URL = "https://your-project.supabase.co";
const PLACEHOLDER_KEY = "your-anon-key";

export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const isConfigured =
    url.length > 0 &&
    anonKey.length > 0 &&
    url !== PLACEHOLDER_URL &&
    anonKey !== PLACEHOLDER_KEY;

  return { url, anonKey, isConfigured };
}

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const env = getSupabaseEnv();

  if (!env.isConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }

  return { url: env.url, anonKey: env.anonKey };
}
