import { AsyncLocalStorage } from "node:async_hooks";

// Server-only request context. Shared reads within one render share its budget.
const readBudget = new AsyncLocalStorage<{ signal: AbortSignal; requestId?: string }>();

export class ReadBudgetExceeded extends Error {
  constructor() {
    super("Dashboard data loading timed out");
    this.name = "ReadBudgetExceeded";
  }
}

export function getReadBudgetSignal(): AbortSignal | undefined {
  return readBudget.getStore()?.signal;
}

export function getReadBudgetRequestId(): string | undefined {
  return readBudget.getStore()?.requestId;
}

export async function withReadBudget<T>(operation: () => Promise<T>, timeoutMs: number, requestId?: string): Promise<T> {
  const controller = new AbortController();
  const parent = getReadBudgetSignal();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => controller.abort(new ReadBudgetExceeded()), timeoutMs);
  });
  try {
    signal.throwIfAborted();
    return await Promise.race([readBudget.run({ signal, requestId: requestId ?? getReadBudgetRequestId() }, operation), deadline]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    // Abort work that outlived a successful/failed render as well.
    controller.abort();
  }
}
