/**
 * Keep database requests finite and uncached.
 *
 * A request that never settles can keep a dynamic Next.js render open until the
 * hosting platform closes the response. When that render is streaming, React
 * surfaces the abrupt close in the browser as `Connection closed`.
 */
import { getReadBudgetSignal } from "./read-budget";
import { fetchWithSignal } from "./fetch-with-signal";

export const SUPABASE_REQUEST_TIMEOUT_MS = 20_000;

function requestSignals(): AbortSignal[] {
  const timeout = AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS);
  const signals = [timeout];
  const budget = getReadBudgetSignal();
  if (budget) signals.push(budget);
  return signals;
}

export function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetchWithSignal(input, init, requestSignals());
}
