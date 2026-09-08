#!/usr/bin/env node
/**
 * Sync Worker production readiness preflight.
 *
 *   npx --no-install tsx scripts/verify-worker-production-readiness.mjs
 *
 * Runs in CI immediately before every scheduled worker tick, and locally before
 * trusting the schedule. It answers one question: "if the worker ran right now,
 * would it be able to?" — without performing a single Wildberries request or
 * Supabase write.
 *
 * Checks
 *    1  worker CLI loads and runs
 *    2  task registry resolves every declared task
 *    3  tsx is an exact pinned dependency and resolves locally
 *    4  required configuration validation works, end to end
 *    5  secret values are redacted from logs
 *    6  workflow secret names match the worker's contract and the docs
 *    7  concurrency configuration is present and safe
 *    8  no setInterval / process-lifetime scheduler under src/worker
 *    9  no filesystem lock under src/worker
 *   10  no next/server after() dependency on the worker's sync path
 *   11  dashboard and report page loads reach no WB HTTP client
 *   12  the worker really resolves the kernels production sync needs
 *
 * Deliberately not grep-only: the CLI is executed as a real child process, the
 * task registry and sync kernels are actually imported, the logger really runs,
 * and the WB boundary is measured by resolving import graphs.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createImportGraph, walkFiles } from "./lib/import-graph.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "src");
const { rel, wbSinksFor } = createImportGraph({ root, srcDir: SRC });

let failures = 0;
let skipped = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(label, why) {
  skipped += 1;
  console.log(`SKIP  ${label} — ${why}`);
}

const read = (p) => readFileSync(path.join(root, p), "utf8");

/** The pinned local tsx CLI. Using it directly proves no registry fetch is involved. */
const TSX_CLI = path.join(root, "node_modules/tsx/dist/cli.mjs");

/** Run a repo script in a child process and capture status/output. */
function runScript(scriptRelPath, args = [], options = {}) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [TSX_CLI, path.join(root, scriptRelPath), ...args],
      {
        cwd: options.cwd ?? root,
        env: options.env ?? process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: options.timeoutMs ?? 120_000,
      }
    );
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      status: typeof err.status === "number" ? err.status : -1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? String(err.message ?? err),
    };
  }
}

console.log("=== Sync Worker — production readiness preflight ===\n");

// ---------------------------------------------------------------------------
console.log("--- 3. tsx dependency ---");
// Checked first: everything below depends on the pinned runtime being real.
{
  const pkg = JSON.parse(read("package.json"));
  const pinned = pkg.devDependencies?.tsx;

  check(
    "3  tsx is declared as a devDependency",
    typeof pinned === "string",
    pinned ? `tsx@${pinned}` : "missing from devDependencies"
  );
  check(
    "3  tsx version is exact (no range operator)",
    typeof pinned === "string" && /^\d+\.\d+\.\d+$/.test(pinned),
    pinned ?? "n/a"
  );

  const lockPath = path.join(root, "package-lock.json");
  if (!existsSync(lockPath)) {
    check("3  tsx is present in the lockfile", false, "package-lock.json missing");
  } else {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const entry = lock.packages?.["node_modules/tsx"];
    check(
      "3  lockfile pins the same tsx version",
      !!entry && entry.version === pinned,
      entry ? `lock=${entry.version}, manifest=${pinned}` : "not in lockfile"
    );
  }

  check(
    "3  pinned tsx binary is installed locally",
    existsSync(TSX_CLI),
    existsSync(TSX_CLI)
      ? `node_modules/tsx@${JSON.parse(read("node_modules/tsx/package.json")).version}`
      : "run npm ci"
  );

  // The workflow must consume the locked dependency, never an ad-hoc download.
  const wfPath = path.join(root, ".github/workflows/sync-worker.yml");
  if (existsSync(wfPath)) {
    const wf = read(".github/workflows/sync-worker.yml");
    check(
      "3  workflow does not fetch tsx from the registry",
      !/npx\s+--yes\s+tsx@/.test(wf) && !/npx\s+tsx@/.test(wf),
      "no `npx --yes tsx@<version>` invocations"
    );
    check(
      "3  workflow forces the locked binary via --no-install",
      /npx\s+--no-install\s+tsx\b/.test(wf),
      "npx --no-install tsx"
    );
    check(
      "3  workflow installs from the lockfile",
      /npm\s+ci\b/.test(wf),
      "npm ci"
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n--- 1/2/12. Worker loads and resolves its kernels ---");
{
  // 1 — real process, real exit code. `--help` neither reads env nor touches IO.
  const help = runScript("scripts/run-sync-worker.mjs", ["--help"]);
  check(
    "1  worker CLI loads and runs",
    help.status === 0 && /Production Sync Worker entrypoint/.test(help.stdout),
    help.status === 0 ? "exit 0" : `exit ${help.status}: ${help.stderr.slice(0, 120)}`
  );

  // 2 — actually import the registry and inspect the runners.
  const { WORKER_TASK_RUNNERS } = await import("../src/worker/tasks/index.ts");
  const { SYNC_WORKER_TASKS, DEFAULT_SYNC_WORKER_TASKS } = await import(
    "../src/worker/types.ts"
  );
  const registered = Object.keys(WORKER_TASK_RUNNERS);
  check(
    "2  task registry resolves every declared task",
    SYNC_WORKER_TASKS.every(
      (t) => typeof WORKER_TASK_RUNNERS[t] === "function"
    ) && registered.length === SYNC_WORKER_TASKS.length,
    registered.join(", ")
  );
  check(
    "2  default task set is a subset of the registry",
    DEFAULT_SYNC_WORKER_TASKS.every((t) => registered.includes(t)),
    DEFAULT_SYNC_WORKER_TASKS.join(", ")
  );

  // 12 — the kernels the tasks lazily import must resolve outside Next.js.
  // This is the failure mode that would only show up on the first real tick.
  const requiredKernels = [
    ["@/services/commercial-continuity-service", "../src/services/commercial-continuity-service.ts", "runCommercialContinuityTick"],
    ["@/services/inventory-snapshot-continuity-service", "../src/services/inventory-snapshot-continuity-service.ts", "runInventorySnapshotContinuityForAccount"],
    ["@/lib/finance-incremental", "../src/lib/finance-incremental/index.ts", "runFinanceIncrementalSync"],
    ["@/services/marketplace-account-service", "../src/services/marketplace-account-service.ts", "getMarketplaceAccountForSync"],
  ];

  // Supabase helpers read these at module scope in some paths; a placeholder is
  // enough to import, and real values are already present in CI.
  const placeholders = {
    NEXT_PUBLIC_SUPABASE_URL: "https://preflight.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "preflight",
    SUPABASE_SERVICE_ROLE_KEY: "preflight",
    MARKETPLACE_CREDENTIALS_KEY: "0".repeat(64),
  };
  const restore = {};
  for (const [k, v] of Object.entries(placeholders)) {
    if (!process.env[k]) {
      restore[k] = undefined;
      process.env[k] = v;
    }
  }

  const unresolved = [];
  for (const [spec, modPath, exportName] of requiredKernels) {
    try {
      const mod = await import(modPath);
      if (typeof mod[exportName] !== "function") {
        unresolved.push(`${spec} (missing ${exportName})`);
      }
    } catch (err) {
      unresolved.push(`${spec} (${err instanceof Error ? err.message.split("\n")[0] : err})`);
    }
  }

  for (const k of Object.keys(restore)) delete process.env[k];

  check(
    "12 worker resolves every kernel production sync needs",
    unresolved.length === 0,
    unresolved.length === 0
      ? `${requiredKernels.length} kernels importable outside Next.js`
      : unresolved.join("; ")
  );

  // CI parity. The checks above import from the working tree, which can contain
  // modules that were never committed. CI runs a clean checkout, so anything
  // the worker imports that git does not track becomes MODULE_NOT_FOUND on the
  // first scheduled tick — long after this file looked green locally.
  let trackedFiles = null;
  try {
    trackedFiles = new Set(
      execFileSync("git", ["ls-files"], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      })
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    );
  } catch {
    trackedFiles = null;
  }

  if (!trackedFiles) {
    skip("12 worker dependencies are committed", "git not available");
  } else {
    const { seen } = createImportGraph({ root, srcDir: SRC }).reachable(
      path.join(SRC, "worker/index.ts"),
      { includeDeferred: true }
    );
    const uncommitted = [...seen].map(rel).filter((p) => !trackedFiles.has(p)).sort();
    check(
      "12 every module the worker imports is committed",
      uncommitted.length === 0,
      uncommitted.length === 0
        ? `${seen.size} modules, all tracked`
        : `${uncommitted.length}/${seen.size} untracked — worker cannot run on a clean checkout: ${uncommitted
            .slice(0, 4)
            .join(", ")}${uncommitted.length > 4 ? `, +${uncommitted.length - 4} more` : ""}`
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n--- 4. Configuration validation ---");
{
  const { inspectWorkerEnvironment, requiredWorkerEnvNames } = await import(
    "../src/worker/env.ts"
  );

  check(
    "4  missing configuration is detected",
    inspectWorkerEnvironment({}).missing.length === 4,
    inspectWorkerEnvironment({}).missing.join(", ")
  );

  const aliased = inspectWorkerEnvironment({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    MARKETPLACE_CREDENTIALS_KEY: "0".repeat(64),
  });
  check(
    "4  server-shaped aliases satisfy the contract",
    aliased.missing.length === 0 && aliased.aliasesApplied.length === 2,
    aliased.aliasesApplied.join(", ")
  );

  // B — the worker must not require web-only NEXT_PUBLIC_* naming, and must not
  // silently accept a half-configured environment.
  check(
    "4  worker env contract is server-shaped",
    requiredWorkerEnvNames().every((n) => !n.startsWith("NEXT_PUBLIC_")),
    requiredWorkerEnvNames().join(", ")
  );

  // End-to-end: a real child process with a scrubbed environment and .env
  // loading disabled must exit 20 (permanent config error), not 1 and not 0.
  // Launched from a foreign cwd, which also exercises the path-alias anchoring
  // below.
  const scrubbed = {
    PATH: process.env.PATH ?? "",
    SystemRoot: process.env.SystemRoot ?? "",
    TEMP: os.tmpdir(),
    TMP: os.tmpdir(),
  };
  const bare = runScript(
    "scripts/run-sync-worker.mjs",
    ["--tasks", "ads", "--no-dotenv"],
    {
      cwd: os.tmpdir(),
      env: { ...scrubbed, TSX_TSCONFIG_PATH: path.join(root, "tsconfig.json") },
    }
  );
  check(
    "4  unconfigured worker exits 20 (permanent), not 0 or 1",
    bare.status === 20,
    `exit ${bare.status}`
  );
  check(
    "4  configuration error names the missing variables without printing values",
    /Missing required worker environment/.test(bare.stderr) &&
      !/eyJ|[0-9a-f]{64}/.test(bare.stderr),
    "names only, no values"
  );

  // tsx resolves the `@/*` alias from a tsconfig.json discovered via the
  // working directory, at loader-registration time. A launcher with a different
  // cwd therefore needs TSX_TSCONFIG_PATH; the run above proves that works.
  check(
    "4  worker runs from a foreign cwd when TSX_TSCONFIG_PATH is set",
    !/MODULE_NOT_FOUND|Cannot find module/.test(bare.stderr),
    bare.stderr.match(/Cannot find module '[^']+'/)?.[0] ?? "path aliases resolve"
  );

  // ...and without it the worker must say so, rather than dying on a bare
  // MODULE_NOT_FOUND thrown from somewhere deep in the import graph.
  const unanchored = runScript(
    "scripts/run-sync-worker.mjs",
    ["--tasks", "ads", "--no-dotenv"],
    { cwd: os.tmpdir(), env: scrubbed }
  );
  check(
    "4  misconfigured launcher gets an actionable error, not MODULE_NOT_FOUND",
    unanchored.status === 20 &&
      /TSX_TSCONFIG_PATH/.test(unanchored.stderr) &&
      !/Cannot find module/.test(unanchored.stderr),
    `exit ${unanchored.status}, names TSX_TSCONFIG_PATH`
  );

  // The workflow must actually set it, or CI depends on runner cwd behaviour.
  const wf = existsSync(path.join(root, ".github/workflows/sync-worker.yml"))
    ? read(".github/workflows/sync-worker.yml")
    : "";
  check(
    "4  workflow pins TSX_TSCONFIG_PATH",
    /TSX_TSCONFIG_PATH:/.test(wf),
    "checkout-location independent"
  );
  check(
    "4  workflow runs the worker with --no-dotenv",
    /--no-dotenv/.test(wf),
    "injected secrets cannot be shadowed by a stray .env"
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- 5. Secret redaction ---");
{
  const { createWorkerLogger } = await import("../src/worker/logger.ts");
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "preflight-secret-value-do-not-log";

  const lines = [];
  const logger = createWorkerLogger("preflight", (l) => lines.push(l));
  logger.info("probe", {
    message: "using preflight-secret-value-do-not-log to connect",
    nested: { jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlYWJj" },
  });

  if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;

  const output = lines.join("\n");
  check(
    "5  known secret values never reach a log line",
    !output.includes("preflight-secret-value-do-not-log") &&
      output.includes("[redacted]"),
    "redacted"
  );
  check(
    "5  token-shaped strings are redacted",
    !output.includes("eyJhbGciOiJIUzI1NiJ9"),
    "JWT-shaped value stripped"
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- 6/7. Workflow contract ---");
{
  const wfPath = path.join(root, ".github/workflows/sync-worker.yml");
  if (!existsSync(wfPath)) {
    check("6  workflow exists", false, ".github/workflows/sync-worker.yml");
  } else {
    const wf = read(".github/workflows/sync-worker.yml");

    // 6 — every secret the worker requires must actually be wired in the
    // workflow, under the alias names the worker accepts.
    const REQUIRED_WORKFLOW_SECRETS = [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "MARKETPLACE_CREDENTIALS_KEY",
    ];
    const unwired = REQUIRED_WORKFLOW_SECRETS.filter(
      (name) => !new RegExp(`${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`).test(wf)
    );
    check(
      "6  every required secret is wired from GitHub Secrets",
      unwired.length === 0,
      unwired.length === 0 ? REQUIRED_WORKFLOW_SECRETS.join(", ") : `unwired: ${unwired.join(", ")}`
    );

    const docPath = "docs/02-architecture/PRODUCTION_SYNC_WORKER.md";
    if (!existsSync(path.join(root, docPath))) {
      check("6  secrets are documented", false, `${docPath} missing`);
    } else {
      const doc = read(docPath);
      const undocumented = REQUIRED_WORKFLOW_SECRETS.filter((n) => !doc.includes(n));
      check(
        "6  every required secret is documented",
        undocumented.length === 0,
        undocumented.length === 0 ? docPath : `undocumented: ${undocumented.join(", ")}`
      );
    }

    check(
      "6  no secret value is hardcoded in the workflow",
      !/(eyJ[A-Za-z0-9_-]{10,}|[0-9a-f]{64})/.test(wf),
      "values come from ${{ secrets.* }} only"
    );
    check(
      "6  per-account WB tokens are not shipped to CI",
      !/WB_API_KEY/.test(wf.replace(/#.*$/gm, "")),
      "WB keys stay encrypted in marketplace_accounts"
    );
    check(
      "6  no NEXT_PUBLIC_* is passed to the worker",
      !/NEXT_PUBLIC_/.test(wf.replace(/#.*$/gm, "")),
      "server-shaped aliases only"
    );
    check(
      "6  web-only inventory timer is disabled in worker runs",
      /INVENTORY_SNAPSHOT_SCHEDULER:\s*["']0["']/.test(wf),
      "INVENTORY_SNAPSHOT_SCHEDULER=0"
    );

    // 7 — concurrency, schedule and budget. Parse the workflow rather than
    // pattern-matching it, so a syntactically broken file fails here instead of
    // on GitHub, and so a key nested under the wrong parent cannot pass.
    let doc = null;
    try {
      const { load } = await import("js-yaml");
      doc = load(wf);
    } catch {
      doc = null;
    }

    if (!doc) {
      skip("7  workflow structural checks", "no YAML parser resolvable; regex fallback below");
      check(
        "7  runs are serialised by a concurrency group",
        /concurrency:[\s\S]*?group:\s*sync-worker/.test(wf) &&
          /cancel-in-progress:\s*false/.test(wf),
        "group: sync-worker, cancel-in-progress: false"
      );
    } else {
      check("7  workflow YAML parses", typeof doc === "object", "valid YAML");

      // `on` is parsed as the boolean true by YAML 1.1 — read both spellings.
      const on = doc.on ?? doc[true];
      const crons = (on?.schedule ?? []).map((s) => s.cron);
      check(
        "7  schedule is hourly",
        crons.length === 1 && /^\d+\s+\*\s+\*\s+\*\s+\*$/.test(crons[0] ?? ""),
        crons.join(", ") || "no schedule"
      );
      check(
        "7  manual dispatch is available for recovery runs",
        on !== undefined && "workflow_dispatch" in on,
        "workflow_dispatch"
      );
      check(
        "7  runs are serialised by a concurrency group",
        typeof doc.concurrency?.group === "string" && doc.concurrency.group.length > 0,
        `group: ${doc.concurrency?.group}`
      );
      check(
        "7  an in-flight worker is never cancelled mid-page",
        doc.concurrency?.["cancel-in-progress"] === false,
        `cancel-in-progress: ${doc.concurrency?.["cancel-in-progress"]}`
      );

      const job = doc.jobs?.sync;
      check(
        "7  worker job exists and is time-boxed",
        !!job && typeof job["timeout-minutes"] === "number",
        `timeout-minutes: ${job?.["timeout-minutes"]}`
      );
      check(
        "7  workflow requests no write permissions",
        doc.permissions?.contents === "read" &&
          Object.keys(doc.permissions ?? {}).length === 1,
        JSON.stringify(doc.permissions)
      );
      // Every env value must be an expression, never an inline literal.
      const literalEnv = Object.entries(job?.env ?? {}).filter(
        ([k, v]) =>
          typeof v === "string" &&
          !v.includes("${{") &&
          !["0", "1", "false", "true"].includes(v) &&
          !k.startsWith("TSX_")
      );
      check(
        "7  no job env value is an inline literal",
        literalEnv.length === 0,
        literalEnv.length === 0 ? "all from secrets/vars" : literalEnv.map(([k]) => k).join(", ")
      );
    }

    // The worker budget must finish before the job is killed, otherwise a
    // timeout terminates a run mid-write instead of letting it wind down.
    const budgetMs = Number((wf.match(/--budget-ms\s+(\d+)/) ?? [])[1] ?? NaN);
    const timeoutMin = Number((wf.match(/timeout-minutes:\s*(\d+)/) ?? [])[1] ?? NaN);
    check(
      "7  worker budget is strictly smaller than the job timeout",
      Number.isFinite(budgetMs) &&
        Number.isFinite(timeoutMin) &&
        budgetMs < timeoutMin * 60_000,
      `budget ${budgetMs / 60000} min < timeout ${timeoutMin} min`
    );
    // And smaller than the schedule interval, or runs would queue every hour.
    check(
      "7  worker budget fits inside the hourly interval",
      Number.isFinite(budgetMs) && budgetMs < 60 * 60_000,
      `${budgetMs / 60000} min < 60 min`
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n--- 8/9/10. Worker runtime hygiene ---");
{
  const workerFiles = walkFiles(path.join(SRC, "worker"));
  // Comments describe what the worker deliberately avoids, so strip them before
  // asserting the code is free of those constructs.
  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const workerSrc = workerFiles
    .map((f) => stripComments(readFileSync(f, "utf8")))
    .join("\n");

  check(
    "8  no setInterval / process-lifetime scheduler under src/worker",
    !/setInterval|setTimeout\s*\(/.test(workerSrc),
    `${workerFiles.length} files, no timers`
  );
  check(
    "9  no filesystem lock under src/worker",
    !/writeFileSync|\bfs\.writeFile\b|\.lock\b|readFileSync/.test(workerSrc),
    "durable state lives in Supabase only"
  );

  // 10 — after() only works inside a Next request scope. If it ever reaches the
  // blocking sync path, the worker breaks on its first production tick.
  const jobService = read("src/services/sync-job-service.ts");
  const blockingStart = jobService.indexOf(
    "export async function runBlockingDashboardSync"
  );
  const blockingBody =
    blockingStart >= 0
      ? jobService.slice(
          blockingStart,
          jobService.indexOf("export async function", blockingStart + 10)
        )
      : "";
  check(
    "10 blocking sync path does not use next/server after()",
    blockingStart >= 0 && !/\bafter\s*\(/.test(blockingBody),
    blockingStart < 0
      ? "runBlockingDashboardSync not found"
      : "after() confined to the background scheduler"
  );
  check(
    "10 worker never calls the request-scoped background scheduler",
    !/scheduleBackgroundDashboardSync/.test(workerSrc),
    "runBlockingDashboardSync path only"
  );
  check(
    "10 worker imports next/server nowhere",
    !/from\s+["']next\/server["']/.test(workerSrc),
    "no direct Next runtime coupling"
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- 11. Page-load WB boundary ---");
{
  // Targeted graph walk: dashboard plus every reports page. The exhaustive
  // 92-entrypoint sweep lives in verify:production-data-plane; this preflight
  // keeps the hourly cost low while still measuring real imports.
  const dashboard = path.join(SRC, "app/page.tsx");
  const reportPages = walkFiles(path.join(SRC, "app/reports")).filter((f) =>
    /[\\/]page\.tsx$/.test(f)
  );

  if (!existsSync(dashboard)) {
    check("11 dashboard page exists", false, "src/app/page.tsx missing");
  } else {
    const d = wbSinksFor(dashboard);
    check(
      "11 dashboard page load reaches no WB HTTP client",
      d.sinks.length === 0,
      d.sinks.length === 0 ? `${d.count} modules, 0 WB sinks` : d.chains[0]
    );
    // Guard against a resolver that silently resolves nothing.
    check(
      "11 import resolution is working (non-vacuous result)",
      d.count >= 10,
      `${d.count} modules reachable`
    );
  }

  const offenders = [];
  for (const page of reportPages) {
    const r = wbSinksFor(page);
    if (r.sinks.length > 0) offenders.push(r.chains[0]);
  }
  check(
    "11 report page loads reach no WB HTTP client",
    reportPages.length > 0 && offenders.length === 0,
    `${reportPages.length} report pages; offenders: ${offenders.join(" | ") || "none"}`
  );

  // Positive control: ingestion must be reachable from the worker, or checks
  // above would pass simply because sync is broken.
  const workerEntry = path.join(SRC, "worker/index.ts");
  const w = wbSinksFor(workerEntry, { includeDeferred: true });
  check(
    "11 worker still reaches WB ingestion (sync is not a no-op)",
    w.sinks.length > 0,
    `${w.sinks.length} ingestion modules, e.g. ${w.sinks.length ? rel(w.sinks[0]) : "-"}`
  );
}

console.log(
  `\n${failures === 0 ? "RESULT: PASS" : "RESULT: FAIL"} — ${failures} failure(s), ${skipped} skipped`
);
if (failures === 0) {
  console.log("Worker is preflight-clean: safe to run a real tick.");
}
process.exit(failures === 0 ? 0 : 1);
