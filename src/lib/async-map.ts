import { getReadBudgetSignal } from "@/lib/supabase/read-budget";

/** Bounded independent reads; preserve input order and stop scheduling after failure. */
export async function mapWithConcurrency<T, R>(
  values: readonly T[], concurrency: number, read: (value: T) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Invalid read concurrency");
  const results = new Array<R>(values.length);
  let cursor = 0;
  let failed = false;
  async function worker() {
    while (!failed && cursor < values.length) {
      getReadBudgetSignal()?.throwIfAborted();
      const index = cursor++;
      try { results[index] = await read(values[index]); }
      catch (error) { failed = true; throw error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}
