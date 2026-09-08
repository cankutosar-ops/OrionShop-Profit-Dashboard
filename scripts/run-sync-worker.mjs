#!/usr/bin/env node
/**
 * Production Sync Worker entrypoint.
 *
 *   npx tsx scripts/run-sync-worker.mjs [options]
 *
 * This file is deliberately thin: argument parsing, env loading and exit-code
 * mapping only. All orchestration lives in `src/worker/`, so swapping GitHub
 * Actions for a VPS or container scheduler means running this same command
 * from somewhere else — no business logic moves.
 *
 * Options
 *   --tasks <list>          Comma-separated: commercial,inventory,finance-catchup,ads
 *                           (default: commercial,inventory)
 *   --accounts <list>       Comma-separated marketplace account ids (default: all eligible)
 *   --budget-ms <n>         Wall-clock budget for this invocation (default: 1500000 = 25 min)
 *   --finance-wakes <n>     Max extra Reports/V1 page wakes per account for finance-catchup
 *   --trigger <name>        Label recorded in logs (default: scheduled)
 *   --force                 Ignore per-entity "not due" throttling
 *   --no-dotenv             Ignore .env files; take configuration from the
 *                           process environment only (recommended in CI)
 *   --print-summary         Emit a final human-readable summary block
 *   --help
 *
 * Exit codes
 *   0   all work succeeded or was legitimately skipped
 *   10  a retryable failure occurred; durable state is intact, next wake resumes
 *   20  permanent configuration error (missing secret) — retrying will not help
 *   1   unexpected crash
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, derived from this file rather than from the caller. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCH_CWD = process.cwd();

/**
 * tsx resolves the `@/*` path alias from the `tsconfig.json` it discovers via
 * the working directory, and it does so when the loader registers — before this
 * file runs. Launched from another directory without `TSX_TSCONFIG_PATH`, every
 * `@/` import fails with a bare MODULE_NOT_FOUND deep inside the worker.
 *
 * We cannot repair that from here, so fail immediately with something callers
 * can act on. Any launcher with a different working directory (container,
 * systemd unit, cron entry) needs `TSX_TSCONFIG_PATH` set.
 */
if (
  resolve(LAUNCH_CWD) !== REPO_ROOT &&
  !process.env.TSX_TSCONFIG_PATH &&
  !existsSync(resolve(LAUNCH_CWD, "tsconfig.json"))
) {
  console.error(
    "Worker launched from outside the repository root without TSX_TSCONFIG_PATH.\n" +
      `  working directory: ${LAUNCH_CWD}\n` +
      `  repository root:   ${REPO_ROOT}\n` +
      "TypeScript path aliases (@/*) cannot resolve. Either run from the\n" +
      `repository root, or set TSX_TSCONFIG_PATH=${resolve(REPO_ROOT, "tsconfig.json")}`
  );
  process.exit(20);
}

// Anchor everything else (.env discovery, relative paths) to the repo root.
process.chdir(REPO_ROOT);

/**
 * Load .env files when present. In CI there are none and every value arrives
 * through the process environment, so a missing file is not an error.
 * Existing process env always wins.
 */
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(REPO_ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      process.env[key] ??= value;
    }
  }
}

function parseArgs(argv) {
  const args = {
    tasks: null,
    accounts: null,
    budgetMs: null,
    financeWakes: null,
    trigger: "scheduled",
    force: false,
    dotenv: true,
    printSummary: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    switch (arg) {
      case "--tasks":
        args.tasks = String(next() ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--accounts":
      case "--account":
        args.accounts = String(next() ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--budget-ms":
        args.budgetMs = Number(next());
        break;
      case "--finance-wakes":
        args.financeWakes = Number(next());
        break;
      case "--trigger":
        args.trigger = String(next() ?? "scheduled");
        break;
      case "--force":
        args.force = true;
        break;
      case "--no-dotenv":
        args.dotenv = false;
        break;
      case "--print-summary":
        args.printSummary = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        if (arg.startsWith("--")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(20);
        }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
}

// CI injects configuration through the environment. Skipping .env files there
// keeps a stray checked-in file from shadowing the real secrets.
if (args.dotenv) loadEnv();

// Imported after loadEnv so module-level env reads see the resolved values.
const { runSyncWorkerTick } = await import("../src/worker/run-worker-tick.ts");
const { WorkerConfigurationError, WORKER_EXIT_CONFIG_ERROR } = await import(
  "../src/worker/types.ts"
);

try {
  const result = await runSyncWorkerTick({
    tasks: args.tasks ?? undefined,
    accountIds: args.accounts,
    force: args.force,
    executionBudgetMs: args.budgetMs ?? undefined,
    financeCatchupMaxWakes: args.financeWakes ?? undefined,
    trigger: args.trigger,
  });

  if (args.printSummary) {
    console.log("\n=== Sync Worker Summary ===");
    console.log(`execution:  ${result.executionId}`);
    console.log(`tasks:      ${result.tasks.join(", ")}`);
    console.log(`duration:   ${Math.round(result.durationMs / 1000)}s`);
    console.log(`accounts:   ${result.accountsConsidered}`);
    for (const r of result.results) {
      const account = r.marketplaceAccountId ?? "-";
      const cursor =
        r.financeCursorBefore != null || r.financeCursorAfter != null
          ? ` rrdId ${r.financeCursorBefore ?? "?"} -> ${r.financeCursorAfter ?? "?"}`
          : "";
      console.log(
        `  ${r.outcome.padEnd(18)} ${r.task.padEnd(16)} account=${account}${cursor}` +
          (r.detail ? ` (${r.detail})` : "")
      );
    }
    console.log(`exit:       ${result.exitCode}`);
  }

  process.exit(result.exitCode);
} catch (err) {
  if (err instanceof WorkerConfigurationError) {
    console.error(`[worker] configuration error: ${err.message}`);
    process.exit(WORKER_EXIT_CONFIG_ERROR);
  }
  console.error(
    `[worker] unexpected failure: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
}
