/**
 * Sprint 6.39 — Measure Dashboard load for 7 / 30 / 90 day ranges.
 *
 * Captures:
 * - Time to critical HTML marker ("Commercial Performance")
 * - Full document time
 * - Server-side SQL / core timings from .perf/timings.jsonl (tagged by request)
 * - KPI snapshot from HTML for financial drift checks
 *
 * Usage:
 *   node scripts/measure-dashboard-perf-6-39.mjs [baseUrl] [label]
 *   label: before | after (default before)
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  appendFileSync,
} from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

const baseUrl = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const label = process.argv[3] || "before";
const root = process.cwd();
const perfDir = resolve(root, ".perf");
mkdirSync(perfDir, { recursive: true });

const CRITICAL_MARKER = "Commercial Performance";
const FETCH_TIMEOUT_MS = 180_000;
const ACCOUNT = "1";
const COMPANY = "1";

/** Fixed "today" for reproducible ranges (matches sprint date context). */
const ANCHOR = "2026-07-17";

function daysAgo(anchorIso, days) {
  const d = new Date(`${anchorIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

const ranges = [
  { days: 7, from: daysAgo(ANCHOR, 7), to: ANCHOR },
  { days: 30, from: daysAgo(ANCHOR, 30), to: ANCHOR },
  { days: 90, from: daysAgo(ANCHOR, 90), to: ANCHOR },
];

function extractKpis(html) {
  // Pull visible ruble amounts near known labels when present in streamed HTML.
  const pick = (label) => {
    const re = new RegExp(
      `${label}[\\s\\S]{0,240}?([\\d\\s\\u00a0]+(?:[.,]\\d+)?)\\s*(?:₽|руб)?`,
      "i"
    );
    const m = html.match(re);
    return m ? m[1].replace(/[\s\u00a0]/g, "").replace(",", ".") : null;
  };
  return {
    hasCommercialPerformance: html.includes(CRITICAL_MARKER),
    hasSettlement: /WB Settlement|Settlement/i.test(html),
    netSalesHint: pick("Net Sales") ?? pick("Sales"),
    operatingProfitHint: pick("Operating Profit") ?? pick("Net Profit"),
    finalNetProfitHint: pick("Final Net Profit"),
    sellerPayoutHint: pick("Seller Payout"),
  };
}

async function measureOnce(path) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const runId = randomUUID();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "text/html",
        "x-perf-run-id": runId,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const ttfbMs = Date.now() - started;

    let criticalMs = null;
    let body = "";
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
        if (criticalMs == null && body.includes(CRITICAL_MARKER)) {
          criticalMs = Date.now() - started;
        }
      }
      body += decoder.decode();
    } else {
      body = await res.text();
      if (body.includes(CRITICAL_MARKER)) criticalMs = Date.now() - started;
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
      totalMs,
      bytes: body.length,
      ok: res.ok && !hasAsyncHooksError && !has500 && criticalMs != null,
      hasAsyncHooksError,
      kpis: extractKpis(body),
      runId,
      measuredAt: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}

function avg(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function loadTimingsSince(tsStart) {
  const path = resolve(perfDir, "timings.jsonl");
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (e.ts >= tsStart - 2000) out.push(e);
    } catch {
      // skip
    }
  }
  return out;
}

function summarizeSql(events, from, to) {
  const sql = events.filter(
    (e) =>
      e.category === "sql" &&
      String(e.meta?.from ?? "") === from &&
      String(e.meta?.to ?? "") === to
  );
  const core = events.filter(
    (e) =>
      (e.name === "server.getDashboardCoreData" ||
        e.name === "server.DashboardPage.critical" ||
        e.name === "server.fetchScopedDashboardSql") &&
      String(e.meta?.from ?? "") === from &&
      String(e.meta?.to ?? "") === to
  );
  const byName = new Map();
  for (const e of sql) {
    const prev = byName.get(e.name) ?? { count: 0, durationMs: 0, rows: 0, pages: 0 };
    prev.count += 1;
    prev.durationMs += e.durationMs || 0;
    prev.rows += Number(e.meta?.rows ?? 0);
    prev.pages += Number(e.meta?.pages ?? 0);
    byName.set(e.name, prev);
  }
  const queries = [...byName.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      avgDurationMs: Math.round(v.durationMs / v.count),
      totalRows: v.rows,
      avgRows: Math.round(v.rows / v.count),
      avgPages: Math.round((v.pages / v.count) * 10) / 10,
    }))
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs);

  const queryCount = sql.length;
  const totalRows = sql.reduce((s, e) => s + Number(e.meta?.rows ?? 0), 0);
  const coreAvg = (name) => {
    const rows = core.filter((e) => e.name === name);
    return rows.length ? avg(rows.map((r) => r.durationMs)) : null;
  };

  return {
    queryCount,
    totalRows,
    queries,
    coreMs: {
      fetchScopedDashboardSql: coreAvg("server.fetchScopedDashboardSql"),
      getDashboardCoreData: coreAvg("server.getDashboardCoreData"),
      dashboardPageCritical: coreAvg("server.DashboardPage.critical"),
    },
  };
}

async function measureRange(range) {
  const path = `/?company=${COMPANY}&account=${ACCOUNT}&from=${range.from}&to=${range.to}`;
  // Warm-up (not recorded in averages)
  await measureOnce(path);
  const aStart = Date.now();
  const a = await measureOnce(path);
  const mid = Date.now();
  const b = await measureOnce(path);
  const end = Date.now();

  // Allow server async append to flush
  await new Promise((r) => setTimeout(r, 400));
  const events = loadTimingsSince(aStart);
  const sqlSummary = summarizeSql(events, range.from, range.to);

  const samples = [a, b];
  const okSamples = samples.filter((s) => s.ok);
  const pool = okSamples.length ? okSamples : samples;

  return {
    days: range.days,
    from: range.from,
    to: range.to,
    path,
    avgTtfbMs: avg(pool.map((s) => s.ttfbMs)),
    avgCriticalMs: avg(pool.map((s) => s.criticalMs)),
    avgTotalMs: avg(pool.map((s) => s.totalMs)),
    ok: samples.every((s) => s.ok),
    samples: samples.map((s) => ({
      status: s.status,
      ttfbMs: s.ttfbMs,
      criticalMs: s.criticalMs,
      totalMs: s.totalMs,
      ok: s.ok,
      kpis: s.kpis,
    })),
    sql: sqlSummary,
    windowMs: { aStart, mid, end },
  };
}

async function main() {
  console.log(`Sprint 6.39 measure (${label}) against ${baseUrl}`);
  const results = [];
  for (const range of ranges) {
    process.stdout.write(`  ${range.days}d ${range.from}→${range.to}… `);
    try {
      const row = await measureRange(range);
      results.push(row);
      console.log(
        `critical=${row.avgCriticalMs}ms total=${row.avgTotalMs}ms sqlQueries≈${row.sql.queryCount} rows≈${row.sql.totalRows} ok=${row.ok}`
      );
      appendFileSync(
        resolve(perfDir, "timings.jsonl"),
        `${JSON.stringify({
          id: randomUUID(),
          ts: Date.now(),
          category: "client",
          name: `nav.dashboard_${range.days}d`,
          durationMs: row.avgCriticalMs,
          route: row.path,
          meta: {
            source: "measure-dashboard-perf-6-39",
            label,
            days: range.days,
            ok: row.ok,
            ttfbMs: row.avgTtfbMs,
            totalMs: row.avgTotalMs,
            queryCount: row.sql.queryCount,
            totalRows: row.sql.totalRows,
          },
        })}\n`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`ERROR ${message}`);
      results.push({
        days: range.days,
        from: range.from,
        to: range.to,
        ok: false,
        error: message,
      });
    }
  }

  const payload = {
    measuredAt: new Date().toISOString(),
    baseUrl,
    label,
    metric: "time_to_critical_marker",
    results,
  };
  const outPath = resolve(perfDir, `sprint-6-39-${label}.json`);
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${outPath}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main();
