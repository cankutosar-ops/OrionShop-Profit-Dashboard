/**
 * Structured worker logging.
 *
 * One JSON object per line so GitHub Actions logs stay greppable, plus a
 * redaction pass that strips known secret values and token-shaped strings
 * before anything reaches stdout.
 */

/** Env vars whose values must never appear in a log line. */
const SECRET_ENV_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "MARKETPLACE_CREDENTIALS_KEY",
  "INTERNAL_API_SECRET",
  "CRON_SECRET",
  "WB_API_KEY",
  "WB_API_KEY_ACCOUNT_1",
  "WB_API_KEY_ACCOUNT_2",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

const REDACTED = "[redacted]";

/** JWT / long opaque tokens, which is what both Supabase keys and WB keys look like. */
const TOKEN_SHAPED = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

function secretValues(): string[] {
  const values: string[] = [];
  for (const name of SECRET_ENV_VARS) {
    const raw = process.env[name]?.trim();
    // Short values would redact harmless substrings; real secrets are long.
    if (raw && raw.length >= 8) values.push(raw);
  }
  return values.sort((a, b) => b.length - a.length);
}

export function redact(input: string): string {
  let out = input;
  for (const secret of secretValues()) {
    out = out.split(secret).join(REDACTED);
  }
  return out.replace(TOKEN_SHAPED, REDACTED);
}

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value instanceof Error) return redact(value.message);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

export type WorkerLogLevel = "info" | "warn" | "error";

export type WorkerLogger = {
  executionId: string;
  log: (level: WorkerLogLevel, event: string, fields?: Record<string, unknown>) => void;
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
};

export function createWorkerLogger(
  executionId: string,
  sink: (line: string) => void = (line) => console.log(line)
): WorkerLogger {
  const log = (
    level: WorkerLogLevel,
    event: string,
    fields: Record<string, unknown> = {}
  ) => {
    const payload = {
      ts: new Date().toISOString(),
      level,
      executionId,
      event,
      ...(redactDeep(fields) as Record<string, unknown>),
    };
    sink(JSON.stringify(payload));
  };

  return {
    executionId,
    log,
    info: (event, fields) => log("info", event, fields),
    warn: (event, fields) => log("warn", event, fields),
    error: (event, fields) => log("error", event, fields),
  };
}
