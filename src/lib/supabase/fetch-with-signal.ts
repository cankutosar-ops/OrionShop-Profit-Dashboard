/** Edge-safe transport; request budgets are added by the server adapter. */
export function fetchWithSignal(input: RequestInfo | URL, init: RequestInit | undefined, signals: AbortSignal[]): Promise<Response> {
  const original = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const all = original ? [...signals, original] : signals;
  const signal = combineSignals(all);
  return fetch(input, {
    ...init,
    cache: "no-store",
    signal,
  });
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) return signals[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  // Next's Edge runtime does not expose AbortSignal.any. The operation's
  // controller always aborts on completion, also releasing these listeners.
  const controller = new AbortController();
  const listeners: Array<() => void> = [];
  for (const signal of signals) {
    const onAbort = () => {
      controller.abort(signal.reason);
      for (const dispose of listeners) dispose();
    };
    if (signal.aborted) {
      onAbort();
      break;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    listeners.push(() => signal.removeEventListener("abort", onAbort));
  }
  return controller.signal;
}
