/** Edge-safe deadline that also cancels the participating transport. */
export class OperationTimeoutError extends Error {
  constructor() {
    super("Operation timed out");
    this.name = "OperationTimeoutError";
  }
}

export async function withOperationTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new OperationTimeoutError();
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
