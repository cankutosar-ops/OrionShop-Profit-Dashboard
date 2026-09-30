/**
 * Keep database requests finite and uncached.
 *
 * A request that never settles can keep a dynamic Next.js render open until the
 * hosting platform closes the response. When that render is streaming, React
 * surfaces the abrupt close in the browser as `Connection closed`.
 */
export const SUPABASE_REQUEST_TIMEOUT_MS = 20_000;

function requestSignal(signal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    cache: "no-store",
    signal: requestSignal(init?.signal),
  });
}
