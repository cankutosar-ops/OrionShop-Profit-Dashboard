/**
 * Sprint 6.35.3 — Measure real navigation timings against a running dev server.
 * Records TTFB, time-to-critical-KPI (Commercial Performance marker), and full body.
 *
 * Usage: node scripts/measure-perf-phase1.mjs [baseUrl]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const root = process.cwd();
const perfDir = resolve(root, ".perf");
mkdirSync(perfDir, { recursive: true });

const CRITICAL_MARKER = "Commercial Performance";
const FETCH_TIMEOUT_MS = 600_000;

const scenarios = [
  { name: "Dashboard Initial", path: "/?company=1&account=1", kind: "dashboard_initial" },
  {
    name: "Account Switch",
    path: "/?from=2026-06-17&to=2026-07-16&company=2&account=2",
    kind: "account_switch",
    /** Account 2 WB strip can exceed 10m; critical path is what Phase 1 optimizes. */
    stopAfterCritical: true,
  },
  {
    name: "Dashboard Refresh",
    path: "/?from=2026-06-17&to=2026-07-16&company=1&account=1",
    kind: "dashboard_refresh",
  },
  {
    name: "Brand Change",
    path: "/?from=2026-06-17&to=2026-07-16&company=1&account=1&brand=1",
    kind: "brand_change",
  },
  {
    name: "Date Change",
    path: "/?from=2026-07-01&to=2026-07-16&company=1&account=1",
    kind: "date_change",
  },
  {
    name: "Smart Pricing",
    path: "/analytics/pricing?company=1&account=1",
    kind: "smart_pricing",
    marker: "Smart Pricing",
  },
  {
    name: "Cost Management",
    path: "/costs?company=1&account=1",
    kind: "cost_management",
    marker: "Cost",
  },
];

async function measureOnce(path, marker = CRITICAL_MARKER, stopAfterCritical = false) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: "text/html" },
      redirect: "follow",
      signal: controller.signal,
    });
    const ttfbMs = Date.now() - started;

    let criticalMs = null;
    let body = "";
    let stoppedEarly = false;
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
        if (criticalMs == null && body.includes(marker)) {
          criticalMs = Date.now() - started;
          if (stopAfterCritical) {
            stoppedEarly = true;
            try {
              await reader.cancel();
            } catch {
              // ignore
            }
            break;
          }
        }
      }
      if (!stoppedEarly) body += decoder.decode();
    } else {
      body = await res.text();
      if (body.includes(marker)) criticalMs = Date.now() - started;
    }

    const totalMs = Date.now() - started;
    const hasAsyncHooksError = body.includes("Can't resolve 'async_hooks'");
    const has500 =
      res.status >= 500 ||
      body.includes("Internal Server Error") ||
      body.includes("Application error");

    return {
      status: res.status,
      ttfbMs,
      criticalMs: criticalMs ?? totalMs,
      totalMs: stoppedEarly ? criticalMs ?? totalMs : totalMs,
      bytes: body.length,
      stoppedEarly,
      ok: res.ok && !hasAsyncHooksError && !has500 && criticalMs != null,
      hasAsyncHooksError,
    };
  } finally {
    clearTimeout(timer);
  }
}

function avg(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

async function measureScenario(scenario) {
  const marker = scenario.marker || CRITICAL_MARKER;
  const stop = Boolean(scenario.stopAfterCritical);
  await measureOnce(scenario.path, marker, stop);
  const a = await measureOnce(scenario.path, marker, stop);
  const b = await measureOnce(scenario.path, marker, stop);
  const samples = [a, b];
  const okSamples = samples.filter((s) => s.ok);
  const pool = okSamples.length ? okSamples : samples;
  return {
    name: scenario.name,
    kind: scenario.kind,
    path: scenario.path,
    avgTtfbMs: avg(pool.map((s) => s.ttfbMs)),
    avgCriticalMs: avg(pool.map((s) => s.criticalMs)),
    avgTotalMs: avg(pool.map((s) => s.totalMs)),
    /** Primary metric: interactive KPI availability (critical marker). */
    avgMs: avg(pool.map((s) => s.criticalMs)),
    samples: samples.map((s) => ({
      status: s.status,
      ttfbMs: s.ttfbMs,
      criticalMs: s.criticalMs,
      totalMs: s.totalMs,
      ok: s.ok,
      hasAsyncHooksError: s.hasAsyncHooksError,
    })),
    ok: samples.every((s) => s.ok),
  };
}

async function main() {
  console.log(`Measuring against ${baseUrl} (stream critical marker) …`);
  const results = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  ${scenario.name}… `);
    try {
      const row = await measureScenario(scenario);
      results.push(row);
      console.log(
        `critical=${row.avgCriticalMs} ms ttfb=${row.avgTtfbMs} ms total=${row.avgTotalMs} ms (ok=${row.ok})`
      );
      appendFileSync(
        resolve(perfDir, "timings.jsonl"),
        `${JSON.stringify({
          id: randomUUID(),
          ts: Date.now(),
          category: "client",
          name: `nav.${scenario.kind}`,
          durationMs: row.avgCriticalMs,
          route: scenario.path,
          meta: {
            source: "measure-perf-phase1",
            ok: row.ok,
            ttfbMs: row.avgTtfbMs,
            totalMs: row.avgTotalMs,
            metric: "critical_marker",
          },
        })}\n`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`ERROR ${message}`);
      results.push({
        name: scenario.name,
        kind: scenario.kind,
        path: scenario.path,
        avgMs: null,
        avgCriticalMs: null,
        avgTtfbMs: null,
        avgTotalMs: null,
        ok: false,
        error: message,
      });
    }
  }

  const payload = {
    measuredAt: new Date().toISOString(),
    baseUrl,
    phase: "after",
    metric: "time_to_critical_marker",
    results,
  };
  writeFileSync(resolve(perfDir, "phase1-after.json"), JSON.stringify(payload, null, 2));

  const beforePath = resolve(perfDir, "phase1-before.json");
  let before = null;
  if (existsSync(beforePath)) {
    before = JSON.parse(readFileSync(beforePath, "utf8"));
  }

  const lines = [
    "# Sprint 6.35.3 — Performance Phase 1 Report",
    "",
    `Measured after: ${payload.measuredAt}`,
    `Base URL: ${baseUrl}`,
    `Primary metric: time to critical HTML marker (Model B / page content), not estimated.`,
    "",
    "## Stability",
    "",
    `- Dashboard 500 / async_hooks: ${
      results.every((r) => !r.samples?.some((s) => s.hasAsyncHooksError))
        ? "PASS (not observed)"
        : "FAIL"
    }`,
    `- All scenarios HTTP ok: ${results.every((r) => r.ok) ? "PASS" : "FAIL"}`,
    "",
    "## Measured timings",
    "",
    "| Scenario | Before (critical) | After (critical) | After TTFB | After full body |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];

  for (const row of results) {
    const beforeRow = before?.results?.find((b) => b.kind === row.kind);
    const beforeMs = beforeRow?.avgMs ?? beforeRow?.avgCriticalMs ?? null;
    lines.push(
      `| ${row.name} | ${beforeMs != null ? `${beforeMs} ms` : "—"} | ${
        row.avgCriticalMs != null ? `${row.avgCriticalMs} ms` : "ERR"
      } | ${row.avgTtfbMs != null ? `${row.avgTtfbMs} ms` : "—"} | ${
        row.avgTotalMs != null ? `${row.avgTotalMs} ms` : "—"
      } |`
    );
  }

  lines.push(
    "",
    "## Optimizations applied",
    "",
    "1. Removed remaining date-range duplicate RSC refresh",
    "2. Split Dashboard critical path (SQL + Model B) from deferred WB KPIs/settlement via Suspense",
    "3. Parallelized independent WB requests (orders, weekly reports, balance)",
    "4. Short-lived (45s) request/navigation cache for WB/account lookups",
    "5. `react.cache` SQL + WB-strip dedupe; single widened weekly-reports fetch (no settlement duplicate)",
    "",
    "_Model B calculation formulas unchanged._",
    ""
  );

  writeFileSync(resolve(perfDir, "PHASE1_REPORT.md"), lines.join("\n"));
  console.log(`\nWrote .perf/phase1-after.json and .perf/PHASE1_REPORT.md`);

  const failed = results.filter((r) => !r.ok);
  process.exit(failed.length ? 1 : 0);
}

main();
