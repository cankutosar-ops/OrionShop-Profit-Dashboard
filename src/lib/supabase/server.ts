/**
 * Server data-plane client (Sprint 7.1.D).
 *
 * - User/request path: authenticated JWT → Postgres RLS tenant isolation.
 * - Service path: createAdminClient / enterServiceDbContext → service_role (documented exceptions).
 */

import { createClient } from "@supabase/supabase-js";
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { requireSupabaseEnv } from "./env";
import { supabaseFetch } from "./fetch";
import { createAdminClient } from "./admin";
import { getRequestDbContext } from "./request-db-context";

export type SupabaseClient = ReturnType<typeof createAdminClient>;

function clientFromAccessToken(accessToken: string): SupabaseClient {
  const { url, anonKey } = requireSupabaseEnv();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: supabaseFetch,
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

function anonDataClient(): SupabaseClient {
  const { url, anonKey } = requireSupabaseEnv();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: supabaseFetch },
  });
}

async function accessTokenFromCookies(): Promise<string | null> {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();
  const ssr = createSsrServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Read-only in RSC; middleware refreshes sessions.
      },
    },
  });
  const { data } = await ssr.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Request-scoped Supabase client.
 * Prefer JWT + RLS when ORION_RLS_DATA_PLANE=1 (after Sprint 7.1.D migration).
 * Use createAdminClient() or enterServiceDbContext() for sync/admin.
 */
export async function createServerClient(): Promise<SupabaseClient> {
  const ctx = getRequestDbContext();
  if (ctx?.kind === "service") {
    return createAdminClient();
  }

  const rlsPlane =
    process.env.ORION_RLS_DATA_PLANE === "1" ||
    process.env.ORION_RLS_DATA_PLANE === "true";

  // Until the 7.1.D SQL migration is applied, keep service_role so the app boots.
  if (!rlsPlane) {
    return createAdminClient();
  }

  if (ctx?.kind === "user") {
    return clientFromAccessToken(ctx.accessToken);
  }

  try {
    const token = await accessTokenFromCookies();
    if (token) return clientFromAccessToken(token);
    return anonDataClient();
  } catch {
    throw new Error(
      "createServerClient() requires a Next.js request or enterServiceDbContext(); use createAdminClient() for jobs/scripts."
    );
  }
}
