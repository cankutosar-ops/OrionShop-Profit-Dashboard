/**
 * Sprint 10.2 — Backfill logging (observable entity lifecycle).
 */

export type BackfillLogEvent =
  | "entity_start"
  | "entity_finish"
  | "progress"
  | "retry"
  | "resume"
  | "completion"
  | "session_start"
  | "session_failed"
  | "checkpoint_init";

export type BackfillLogPayload = Record<string, unknown>;

export type BackfillLogger = (event: BackfillLogEvent, payload?: BackfillLogPayload) => void;

export function createConsoleBackfillLogger(prefix = "[warehouse-backfill]"): BackfillLogger {
  return (event, payload = {}) => {
    console.log(prefix, event, payload);
  };
}

export function createRecordingBackfillLogger(): {
  logger: BackfillLogger;
  events: Array<{ event: BackfillLogEvent; payload: BackfillLogPayload }>;
} {
  const events: Array<{ event: BackfillLogEvent; payload: BackfillLogPayload }> = [];
  return {
    events,
    logger: (event, payload = {}) => {
      events.push({ event, payload });
    },
  };
}
