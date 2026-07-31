/**
 * Sprint 10.3 — Incremental sync logging.
 */

export type IncrementalLogEvent =
  | "session_start"
  | "session_blocked"
  | "session_failed"
  | "entity_start"
  | "entity_finish"
  | "entity_paused"
  | "updated_rows"
  | "inserted_rows"
  | "skipped_rows"
  | "errors"
  | "completion"
  | "resume"
  | "checkpoint_init";

export type IncrementalLogPayload = Record<string, unknown>;

export type IncrementalLogger = (
  event: IncrementalLogEvent,
  payload?: IncrementalLogPayload
) => void;

export function createConsoleIncrementalLogger(
  prefix = "[warehouse-incremental]"
): IncrementalLogger {
  return (event, payload = {}) => {
    console.log(prefix, event, payload);
  };
}

export function createRecordingIncrementalLogger(): {
  logger: IncrementalLogger;
  events: Array<{ event: IncrementalLogEvent; payload: IncrementalLogPayload }>;
} {
  const events: Array<{ event: IncrementalLogEvent; payload: IncrementalLogPayload }> = [];
  return {
    events,
    logger: (event, payload = {}) => {
      events.push({ event, payload });
    },
  };
}
