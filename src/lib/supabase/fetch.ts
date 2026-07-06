/** Prevent Next.js from caching Supabase REST fetch responses (causes TypeError: terminated). */
export function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    cache: "no-store",
  });
}
