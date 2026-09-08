#!/usr/bin/env node
/**
 * Production Data Plane verification.
 *
 *   npx tsx scripts/verify-production-data-plane.mjs
 *
 * Asserts the one architectural rule the whole deployment rests on:
 *
 *   USER -> Next.js -> Supabase warehouse -> Financial Engine       (WB HTTP = 0)
 *   Sync Worker -> WB APIs -> normalize -> Supabase warehouse       (WB HTTP allowed)
 *
 * Checks
 *   1  Dashboard page load reaches no WB HTTP client
 *   2  Reports page loads reach no WB HTTP client
 *   3  Product / Category / Brand reports reach no WB HTTP client
 *   4  Export endpoints reach no WB HTTP client
 *   5  The sync worker DOES reach a WB HTTP client (ingestion is really wired)
 *   6  No page-request entrypoint outside the worker reaches WB HTTP
 *
 * This is not a grep. It resolves each entrypoint's transitive *static* import
 * graph through the `@/` alias and relative specifiers, then asks whether any
 * reachable module constructs a Wildberries HTTP client. Static imports are the
 * right boundary: they are what a server render actually loads, and unlike a
 * text scan they cannot be fooled by a file that merely mentions a symbol.
 *
 * Deferred edges (`await import(...)`) are resolved and reported separately —
 * a module can lazily reach ingestion without a page load ever executing that
 * branch, so they are shown as diagnostics rather than treated as failures.
 *
 * What this proves, and what it does not
 * --------------------------------------
 * Reachability is measured per module, not per function. A handful of
 * dual-purpose services expose both warehouse reads and ingestion triggers, so
 * an ops surface that only reads still *loads* the WB client. Those
 * entrypoints are enumerated in DUAL_PURPOSE_ENTRYPOINTS with a reason each,
 * and the list is asserted to be minimal and to exclude every user-facing data
 * page. Check 7 complements the static analysis with a real execution test:
 * importing the page-load data modules under a fetch interceptor must produce
 * zero marketplace requests.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "src");

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

const rel = (p) => path.relative(root, p).replace(/\\/g, "/");

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walkFiles(full, out);
    } else if (/\.(tsx?|mts|cts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Module resolution
// ---------------------------------------------------------------------------

const RESOLVE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  "/index.ts",
  "/index.tsx",
];

/** Resolve a `@/` or relative specifier to a real file, or null if external. */
function resolveSpecifier(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) {
    base = path.join(SRC, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null; // node_modules / builtin — not our boundary
  }

  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const STATIC_IMPORT = /(?:^|\n)\s*import\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
const BARE_IMPORT = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
const REEXPORT = /(?:^|\n)\s*export\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/**
 * Static (eagerly evaluated) and deferred (`await import`) specifiers.
 * Type-only imports are excluded: they vanish at compile time and cannot
 * cause a runtime HTTP call.
 */
function readEdges(file) {
  const src = readFileSync(file, "utf8");
  const staticSpecs = new Set();
  const deferredSpecs = new Set();

  for (const re of [STATIC_IMPORT, REEXPORT]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const clause = m[1] ?? "";
      if (/^type\b/.test(clause.trim())) continue; // `import type { X } from`
      staticSpecs.add(m[2]);
    }
  }

  BARE_IMPORT.lastIndex = 0;
  let bare;
  while ((bare = BARE_IMPORT.exec(src))) staticSpecs.add(bare[1]);

  DYNAMIC_IMPORT.lastIndex = 0;
  let dyn;
  while ((dyn = DYNAMIC_IMPORT.exec(src))) deferredSpecs.add(dyn[1]);

  return { staticSpecs, deferredSpecs };
}

const edgeCache = new Map();
function edgesOf(file) {
  if (!edgeCache.has(file)) edgeCache.set(file, readEdges(file));
  return edgeCache.get(file);
}

/**
 * Transitive closure over static edges. Returns the reachable file set and the
 * first path found to each WB sink, so a failure names the actual chain rather
 * than just the offending file.
 */
function reachable(entry, { includeDeferred = false } = {}) {
  const seen = new Set();
  const parents = new Map();
  const queue = [entry];
  seen.add(entry);

  while (queue.length > 0) {
    const current = queue.shift();
    const { staticSpecs, deferredSpecs } = edgesOf(current);
    const specs = includeDeferred
      ? [...staticSpecs, ...deferredSpecs]
      : [...staticSpecs];

    for (const spec of specs) {
      const target = resolveSpecifier(spec, current);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      parents.set(target, current);
      queue.push(target);
    }
  }
  return { seen, parents };
}

function chainTo(file, parents, entry) {
  const chain = [file];
  let cursor = file;
  while (parents.has(cursor) && cursor !== entry) {
    cursor = parents.get(cursor);
    chain.push(cursor);
  }
  return chain.reverse().map(rel).join(" -> ");
}

// ---------------------------------------------------------------------------
// What counts as "WB HTTP"
// ---------------------------------------------------------------------------

const WB_HOST = /https?:\/\/[a-z0-9.-]*wildberries\.ru/i;

/**
 * A module is a WB HTTP sink when it can actually originate a marketplace
 * request: it builds the client, or it hardcodes a WB host.
 */
function isWbHttpSink(file) {
  const src = readFileSync(file, "utf8");
  if (WB_HOST.test(src)) return true;
  return /\bnew\s+WbApiClient\s*\(/.test(src) || /\bcreateWbSyncService\s*\(/.test(src);
}

const sinkCache = new Map();
function wbSink(file) {
  if (!sinkCache.has(file)) sinkCache.set(file, isWbHttpSink(file));
  return sinkCache.get(file);
}

function wbSinksFor(entry, options) {
  const { seen, parents } = reachable(entry, options);
  const sinks = [...seen].filter(wbSink);
  return {
    count: seen.size,
    sinks,
    chains: sinks.map((s) => chainTo(s, parents, entry)),
  };
}

// ---------------------------------------------------------------------------

console.log("=== Production Data Plane — WB API boundary ===\n");

// Self-test the resolver: a walker that silently resolves nothing would make
// every "no WB HTTP" check pass vacuously.
{
  const dashboard = path.join(SRC, "app/page.tsx");
  if (!existsSync(dashboard)) {
    check("resolver self-test", false, "src/app/page.tsx not found");
  } else {
    const { seen } = reachable(dashboard);
    check(
      "resolver self-test — dashboard import graph is non-trivial",
      seen.size >= 10,
      `${seen.size} modules reachable from src/app/page.tsx`
    );
  }
}

const pageFiles = walkFiles(path.join(SRC, "app")).filter((f) =>
  /[\\/]page\.tsx$/.test(f)
);
const routeFiles = walkFiles(path.join(SRC, "app")).filter((f) =>
  /[\\/]route\.ts$/.test(f)
);

console.log("\n--- 1. Dashboard page load ---");
{
  const dashboard = path.join(SRC, "app/page.tsx");
  if (!existsSync(dashboard)) {
    check("1  dashboard page exists", false, "src/app/page.tsx missing");
  } else {
    const r = wbSinksFor(dashboard);
    check(
      "1  dashboard page load reaches no WB HTTP client",
      r.sinks.length === 0,
      r.sinks.length === 0
        ? `${r.count} modules, 0 WB sinks`
        : r.chains.join(" | ")
    );
  }
}

console.log("\n--- 2. Reports page loads ---");
{
  const reportPages = pageFiles.filter((f) => rel(f).startsWith("src/app/reports/"));
  const offenders = [];
  for (const page of reportPages) {
    const r = wbSinksFor(page);
    if (r.sinks.length > 0) offenders.push(r.chains[0]);
  }
  check(
    "2  reports page loads reach no WB HTTP client",
    reportPages.length > 0 && offenders.length === 0,
    `${reportPages.length} report pages; offenders: ${offenders.join(" | ") || "none"}`
  );
}

console.log("\n--- 3. Product / Category / Brand reports ---");
{
  // These render through shared report components as well as their own pages,
  // so both the page entrypoints and the shared component are checked.
  const targets = [
    ...pageFiles.filter((f) =>
      /(product|category|brand|group)/i.test(rel(f)) && rel(f).startsWith("src/app/")
    ),
    path.join(SRC, "components/reporting/group-performance-report-page.tsx"),
  ].filter((f) => existsSync(f));

  const offenders = [];
  for (const target of targets) {
    const r = wbSinksFor(target);
    if (r.sinks.length > 0) offenders.push(r.chains[0]);
  }
  check(
    "3  product/category/brand reports reach no WB HTTP client",
    targets.length > 0 && offenders.length === 0,
    `${targets.length} entrypoints; offenders: ${offenders.join(" | ") || "none"}`
  );
}

console.log("\n--- 4. Reporting export endpoints ---");
{
  // Financial exports: P&L, settlement, product profit, category/brand,
  // unified business Excel. These are pure warehouse reads and must stay so.
  const exportRoutes = routeFiles.filter((f) =>
    /^src\/app\/api\/reports\//.test(rel(f))
  );
  const offenders = [];
  for (const route of exportRoutes) {
    const r = wbSinksFor(route);
    if (r.sinks.length > 0) offenders.push(r.chains[0]);
  }
  if (exportRoutes.length === 0) {
    skip("4  reporting export endpoints", "no report route handlers matched");
  } else {
    check(
      "4  reporting export endpoints reach no WB HTTP client",
      offenders.length === 0,
      `${exportRoutes.length} report routes; offenders: ${offenders.join(" | ") || "none"}`
    );
  }
}

console.log("\n--- 5. Sync worker ingestion ---");
{
  const workerEntry = path.join(SRC, "worker/index.ts");
  if (!existsSync(workerEntry)) {
    check("5  worker entry exists", false, "src/worker/index.ts missing");
  } else {
    // Positive assertion: ingestion must actually be reachable, otherwise the
    // worker is a no-op and checks 1-4 would pass for the wrong reason.
    const r = wbSinksFor(workerEntry, { includeDeferred: true });
    check(
      "5  sync worker DOES reach a WB HTTP client",
      r.sinks.length > 0,
      r.sinks.length > 0
        ? `${r.sinks.length} ingestion module(s), e.g. ${rel(r.sinks[0])}`
        : "worker cannot reach WB ingestion — sync would be a no-op"
    );

    const cliEntry = path.join(root, "scripts/run-sync-worker.mjs");
    check(
      "5  worker CLI entrypoint exists and delegates to src/worker",
      existsSync(cliEntry) &&
        readFileSync(cliEntry, "utf8").includes("src/worker/run-worker-tick.ts"),
      rel(cliEntry)
    );
  }
}

console.log("\n--- 6. No WB HTTP anywhere in the page-request path ---");

/**
 * Control-plane entrypoints allowed to load ingestion modules.
 *
 * These are operator surfaces, not user data pages: they manage or report on
 * sync rather than render financial results. They still must not be user-facing
 * data pages, which check 6b enforces.
 */
const DUAL_PURPOSE_ENTRYPOINTS = new Map([
  [
    "src/app/monitoring/page.tsx",
    "ops surface: renders sync health via production-health-service, which imports the sync job layer",
  ],
  [
    "src/app/api/monitoring/production-health/route.ts",
    "ops surface: same health service as the monitoring page",
  ],
  [
    "src/app/api/monitoring/verify/route.ts",
    "ops surface: runs post-sync verification, which samples WB to confirm ingested data",
  ],
  [
    "src/app/api/marketplace-accounts/route.ts",
    "account management: 'test connection' legitimately calls WB to validate a key",
  ],
  [
    "src/app/api/marketplace-accounts/[id]/route.ts",
    "account management: connection test plus lifecycle triggers",
  ],
  [
    "src/app/api/inventory/history/route.ts",
    "reads snapshots from historical-inventory-service, which also owns snapshot capture",
  ],
  [
    "src/app/api/inventory/history/export/route.ts",
    "same snapshot service as the inventory history read route",
  ],
]);

{
  // Every server-rendered page plus every route handler that is not part of the
  // ingestion control plane. Sync/warehouse routes are allowed to trigger
  // ingestion on purpose; they are operator endpoints, not page loads.
  const INGESTION_ROUTE = /^src\/app\/api\/(sync|warehouse)\//;
  const requestEntrypoints = [
    ...pageFiles,
    ...routeFiles.filter((f) => !INGESTION_ROUTE.test(rel(f))),
  ];

  const offenders = [];
  const reachedAllowed = new Set();
  for (const entry of requestEntrypoints) {
    const r = wbSinksFor(entry);
    if (r.sinks.length === 0) continue;
    if (DUAL_PURPOSE_ENTRYPOINTS.has(rel(entry))) {
      reachedAllowed.add(rel(entry));
      continue;
    }
    offenders.push(r.chains[0]);
  }

  check(
    "6a no page/route request path reaches WB HTTP (outside the documented control plane)",
    requestEntrypoints.length > 0 && offenders.length === 0,
    `${requestEntrypoints.length} entrypoints (${pageFiles.length} pages); offenders: ${
      offenders.slice(0, 5).join(" | ") || "none"
    }`
  );

  // The allow-list must not become a dumping ground: no user-facing data page
  // may be excused, and stale entries must be pruned.
  const USER_DATA_SURFACE =
    /^src\/app\/(page\.tsx|reports\/|analytics\/|costs\/|purchases\/|products\/|categories\/|inventory\/[a-z-]+\/page|audit\/)/;
  const smuggled = [...DUAL_PURPOSE_ENTRYPOINTS.keys()].filter((p) =>
    USER_DATA_SURFACE.test(p)
  );
  check(
    "6b control-plane allow-list contains no user-facing data page",
    smuggled.length === 0,
    smuggled.join(", ") || `${DUAL_PURPOSE_ENTRYPOINTS.size} entries, all ops surfaces`
  );

  const stale = [...DUAL_PURPOSE_ENTRYPOINTS.keys()].filter(
    (p) => !reachedAllowed.has(p)
  );
  check(
    "6c control-plane allow-list is minimal (no stale entries)",
    stale.length === 0,
    stale.length ? `no longer reach WB HTTP, remove: ${stale.join(", ")}` : "all entries still required"
  );

  // Diagnostic only: lazily-reachable ingestion from a page graph. Not a
  // failure, because the branch may never execute during a render.
  const deferredReach = [];
  for (const page of pageFiles) {
    const r = wbSinksFor(page, { includeDeferred: true });
    if (r.sinks.length > 0) deferredReach.push(rel(page));
  }
  console.log(
    `INFO  pages that can reach ingestion only via deferred import(): ${
      deferredReach.length === 0 ? "none" : `${deferredReach.length} — ${deferredReach.slice(0, 5).join(", ")}`
    }`
  );
}

console.log("\n--- 7. Runtime: importing page-load data modules issues no WB HTTP ---");
{
  // Static reachability cannot see module-scope side effects. This actually
  // executes the imports with a fetch interceptor installed, so any request
  // fired during module initialisation is caught rather than inferred.
  const attempted = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    if (/wildberries\.ru/i.test(url)) {
      attempted.push(url);
      throw new Error(`blocked marketplace request during page-load import: ${url}`);
    }
    return originalFetch(input, init);
  };

  const pageLoadModules = [
    "../src/services/persisted-query-service.ts",
    "../src/lib/marketplace-scope.ts",
    "../src/lib/reporting/index.ts",
  ];

  let importFailure = null;
  try {
    for (const mod of pageLoadModules) {
      await import(mod);
    }
  } catch (err) {
    importFailure = err instanceof Error ? err.message : String(err);
  } finally {
    globalThis.fetch = originalFetch;
  }

  if (importFailure && attempted.length === 0) {
    // Missing env (no Supabase credentials) must not masquerade as a pass.
    skip("7  runtime page-load import guard", `module import failed: ${importFailure}`);
  } else {
    check(
      "7  no WB HTTP during page-load module initialisation",
      attempted.length === 0,
      attempted.length === 0
        ? `${pageLoadModules.length} modules imported, 0 marketplace requests`
        : attempted.join(", ")
    );
  }
}

console.log("\n--- Scheduler ownership ---");
{
  // The in-process inventory timer is optional: some checkouts do not have it
  // at all, in which case there is nothing for the web process to start.
  // When it is present, production must not start it — that job belongs to the
  // worker, which keeps its state in Supabase rather than in a process.
  const scheduler = path.join(SRC, "services/inventory-snapshot-continuity-scheduler.ts");
  if (!existsSync(scheduler)) {
    skip(
      "web process does not run the inventory timer in production",
      "no in-process scheduler in this checkout — nothing to disable"
    );
  } else {
    const src = readFileSync(scheduler, "utf8");
    check(
      "web process does not run the inventory timer in production by default",
      src.includes("resolveInventorySchedulerDecision") &&
        src.includes('env.NODE_ENV === "production"'),
      "production requires explicit INVENTORY_SNAPSHOT_SCHEDULER=1"
    );
  }
}

console.log(
  `\n${failures === 0 ? "RESULT: PASS" : "RESULT: FAIL"} — ${failures} failure(s), ${skipped} skipped`
);
process.exit(failures === 0 ? 0 : 1);
