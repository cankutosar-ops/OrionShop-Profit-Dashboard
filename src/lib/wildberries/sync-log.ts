let syncStartMs = 0;

function elapsed(): string {
  if (!syncStartMs) return "+0ms";
  return `+${Date.now() - syncStartMs}ms`;
}

function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return "";
  return ` ${JSON.stringify(data)}`;
}

/** Reset timer at the start of each POST /api/sync request. */
export function beginSyncTrace(requestId: string): void {
  syncStartMs = Date.now();
  console.log(`[sync][${elapsed()}][trace] BEGIN requestId=${requestId}`);
}

export function endSyncTrace(requestId: string, success: boolean): void {
  console.log(
    `[sync][${elapsed()}][trace] END requestId=${requestId} success=${success}`
  );
}

export function syncLog(
  phase: string,
  message: string,
  data?: Record<string, unknown>
): void {
  console.log(`[sync][${elapsed()}][${phase}] ${message}${formatData(data)}`);
}
