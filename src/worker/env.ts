/**
 * Worker environment resolution.
 *
 * The worker runs outside Next.js, so `NEXT_PUBLIC_*` naming is meaningless
 * there — nothing is being inlined into a browser bundle. Deployment secrets
 * may therefore be supplied under server-shaped aliases (`SUPABASE_URL`,
 * `SUPABASE_ANON_KEY`), which this module normalises onto the canonical names
 * the shared Supabase helpers already read.
 */

import { WorkerConfigurationError } from "./types";

/** Alias → canonical name accepted for worker deployments. */
const ENV_ALIASES: Array<[alias: string, canonical: string]> = [
  ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
];

/**
 * Secrets that must exist before any kernel runs.
 *
 * The anon key is required not because the worker authenticates as `anon`, but
 * because `requireSupabaseEnv()` validates URL and anon key together before
 * handing the URL to the service-role client.
 */
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MARKETPLACE_CREDENTIALS_KEY",
] as const;

const PLACEHOLDERS = new Set([
  "https://your-project.supabase.co",
  "your-anon-key",
  "your-service-role-key",
]);

/** Copy any supplied alias onto its canonical name without overwriting an explicit value. */
export function applyWorkerEnvAliases(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const applied: string[] = [];
  for (const [alias, canonical] of ENV_ALIASES) {
    const aliasValue = env[alias]?.trim();
    if (aliasValue && !env[canonical]?.trim()) {
      env[canonical] = aliasValue;
      applied.push(`${alias}→${canonical}`);
    }
  }
  return applied;
}

export type WorkerEnvReport = {
  aliasesApplied: string[];
  missing: string[];
};

/** Names a deployment must provide, in the form the worker accepts them. */
export function requiredWorkerEnvNames(): string[] {
  return [
    "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)",
    "SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MARKETPLACE_CREDENTIALS_KEY",
  ];
}

/** Non-throwing inspection, used by verification scripts. */
export function inspectWorkerEnvironment(
  env: NodeJS.ProcessEnv = process.env
): WorkerEnvReport {
  const aliasesApplied = applyWorkerEnvAliases(env);
  const missing = REQUIRED_ENV.filter((name) => {
    const value = env[name]?.trim();
    return !value || PLACEHOLDERS.has(value);
  });
  return { aliasesApplied, missing };
}

/**
 * Fail fast, and fail *permanently* — a missing secret is not something the
 * next hourly wake can recover from on its own.
 */
export function assertWorkerEnvironment(
  env: NodeJS.ProcessEnv = process.env
): WorkerEnvReport {
  const report = inspectWorkerEnvironment(env);
  if (report.missing.length > 0) {
    throw new WorkerConfigurationError(
      `Missing required worker environment: ${report.missing.join(", ")}. ` +
        `Expected one of: ${requiredWorkerEnvNames().join(", ")}.`
    );
  }
  return report;
}
