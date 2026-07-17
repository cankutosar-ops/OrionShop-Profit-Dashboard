/**
 * Sprint 6.35.2+ — Performance recorder.
 * Enabled unless PERF_AUDIT=0.
 * Server-only: uses Node builtins (async_hooks, fs). Do not import from client modules.
 */
import { AsyncLocalStorage } from "async_hooks";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { PerfCategory, PerfEvent, PerfReportSummary } from "@/lib/perf/types";

const perfStore = new AsyncLocalStorage<{ requestId: string; route?: string }>();

type DupKey = string;

function isEnabled(): boolean {
  return process.env.PERF_AUDIT !== "0";
}

function perfDir(): string {
  return join(process.cwd(), ".perf");
}

function eventsPath(): string {
  return join(perfDir(), "timings.jsonl");
}

function ensureDir() {
  const dir = perfDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const memoryEvents: PerfEvent[] = [];
const MAX_MEMORY = 5000;

/** Fingerprints seen in the current request (duplicate detection). */
const requestFingerprints = new Map<string, Map<DupKey, number>>();

export function getPerfRequestId(): string | undefined {
  return perfStore.getStore()?.requestId;
}

export function runWithPerfRequest<T>(
  route: string | undefined,
  fn: () => Promise<T> | T
): Promise<T> | T {
  if (!isEnabled()) return fn();
  const requestId = randomUUID();
  requestFingerprints.set(requestId, new Map());
  return perfStore.run({ requestId, route }, () => {
    const result = fn();
    if (result && typeof (result as Promise<T>).then === "function") {
      return (result as Promise<T>).finally(() => {
        requestFingerprints.delete(requestId);
      });
    }
    requestFingerprints.delete(requestId);
    return result;
  });
}

export function recordPerfEvent(
  partial: Omit<PerfEvent, "id" | "ts"> & { id?: string; ts?: number }
): void {
  if (!isEnabled()) return;

  const store = perfStore.getStore();
  const event: PerfEvent = {
    id: partial.id ?? randomUUID(),
    ts: partial.ts ?? Date.now(),
    category: partial.category,
    name: partial.name,
    durationMs: partial.durationMs,
    requestId: partial.requestId ?? store?.requestId,
    route: partial.route ?? store?.route,
    meta: partial.meta,
  };

  memoryEvents.push(event);
  if (memoryEvents.length > MAX_MEMORY) {
    memoryEvents.splice(0, memoryEvents.length - MAX_MEMORY);
  }

  try {
    ensureDir();
    appendFileSync(eventsPath(), `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // ignore disk errors in audit mode
  }

  // Duplicate tracking within a request
  if (event.requestId && (event.category === "sql" || event.category === "wb_api")) {
    const fp =
      event.category === "sql"
        ? `sql:${String(event.meta?.table ?? event.name)}`
        : `wb:${String(event.meta?.endpoint ?? event.name)}`;
    const map = requestFingerprints.get(event.requestId) ?? new Map();
    const next = (map.get(fp) ?? 0) + 1;
    map.set(fp, next);
    requestFingerprints.set(event.requestId, map);
    if (next > 1) {
      const dup: PerfEvent = {
        id: randomUUID(),
        ts: Date.now(),
        category: "duplicate",
        name: `duplicate:${fp}`,
        durationMs: 0,
        requestId: event.requestId,
        route: event.route,
        meta: { fingerprint: fp, count: next, originalName: event.name },
      };
      memoryEvents.push(dup);
      try {
        appendFileSync(eventsPath(), `${JSON.stringify(dup)}\n`, "utf8");
      } catch {
        // ignore
      }
    }
  }
}

export async function measureAsync<T>(
  name: string,
  category: PerfCategory,
  fn: () => Promise<T> | T,
  meta?: PerfEvent["meta"]
): Promise<T> {
  if (!isEnabled()) return await fn();
  const started = Date.now();
  try {
    const result = await fn();
    recordPerfEvent({
      category,
      name,
      durationMs: Date.now() - started,
      meta: {
        ...meta,
        ok: true,
        ...(typeof result === "object" &&
        result !== null &&
        Array.isArray(result)
          ? { rows: (result as unknown[]).length }
          : {}),
      },
    });
    return result;
  } catch (error) {
    recordPerfEvent({
      category,
      name,
      durationMs: Date.now() - started,
      meta: { ...meta, ok: false, error: error instanceof Error ? error.message : "error" },
    });
    throw error;
  }
}

export function measureSync<T>(
  name: string,
  category: PerfCategory,
  fn: () => T,
  meta?: PerfEvent["meta"]
): T {
  if (!isEnabled()) return fn();
  const started = performance.now();
  try {
    const result = fn();
    recordPerfEvent({
      category,
      name,
      durationMs: performance.now() - started,
      meta: { ...meta, ok: true },
    });
    return result;
  } catch (error) {
    recordPerfEvent({
      category,
      name,
      durationMs: performance.now() - started,
      meta: { ...meta, ok: false },
    });
    throw error;
  }
}

export function loadAllPerfEvents(): PerfEvent[] {
  const fromDisk: PerfEvent[] = [];
  try {
    if (existsSync(eventsPath())) {
      const text = readFileSync(eventsPath(), "utf8");
      for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try {
          fromDisk.push(JSON.parse(t) as PerfEvent);
        } catch {
          // skip bad lines
        }
      }
    }
  } catch {
    // ignore
  }
  // Prefer disk (includes prior processes); merge recent memory-only if needed
  const byId = new Map<string, PerfEvent>();
  for (const e of fromDisk) byId.set(e.id, e);
  for (const e of memoryEvents) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.ts - b.ts);
}

function avgOf(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function buildPerfReport(events: PerfEvent[] = loadAllPerfEvents()): PerfReportSummary {
  const pageLoads = events.filter((e) => e.name === "page.dashboard.ready");
  const accountSwitches = events.filter((e) => e.name === "nav.account_switch");
  const smartPricing = events.filter((e) => e.name === "page.smart_pricing.ready");
  const dashboardRefresh = events.filter((e) => e.name === "page.dashboard.refresh");

  const top10Longest = [...events]
    .filter((e) => e.category !== "duplicate")
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10)
    .map((e) => ({
      name: e.name,
      category: e.category,
      durationMs: Math.round(e.durationMs * 100) / 100,
      meta: e.meta,
    }));

  const sqlMap = new Map<string, { durationMs: number; rows: number; count: number }>();
  for (const e of events.filter((x) => x.category === "sql")) {
    const key = e.name;
    const prev = sqlMap.get(key) ?? { durationMs: 0, rows: 0, count: 0 };
    prev.durationMs += e.durationMs;
    prev.rows += Number(e.meta?.rows ?? 0);
    prev.count += 1;
    sqlMap.set(key, prev);
  }
  const sql = [...sqlMap.entries()]
    .map(([name, v]) => ({
      name,
      durationMs: Math.round((v.durationMs / v.count) * 100) / 100,
      rows: Math.round(v.rows / v.count),
      count: v.count,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);

  const wbMap = new Map<
    string,
    { durationMs: number; retries: number; count429: number; count: number }
  >();
  for (const e of events.filter((x) => x.category === "wb_api")) {
    const endpoint = String(e.meta?.endpoint ?? e.name);
    const prev = wbMap.get(endpoint) ?? {
      durationMs: 0,
      retries: 0,
      count429: 0,
      count: 0,
    };
    prev.durationMs += e.durationMs;
    prev.retries += Number(e.meta?.retries ?? 0);
    prev.count429 += Number(e.meta?.count429 ?? 0);
    prev.count += 1;
    wbMap.set(endpoint, prev);
  }
  const wbApi = [...wbMap.entries()]
    .map(([endpoint, v]) => ({
      endpoint,
      durationMs: Math.round((v.durationMs / v.count) * 100) / 100,
      retries: v.retries,
      count429: v.count429,
      cache: "miss",
      count: v.count,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);

  const dupMap = new Map<string, { count: number; name: string; category: PerfCategory }>();
  for (const e of events.filter((x) => x.category === "duplicate")) {
    const fp = String(e.meta?.fingerprint ?? e.name);
    const prev = dupMap.get(fp) ?? {
      count: 0,
      name: String(e.meta?.originalName ?? e.name),
      category: "duplicate" as const,
    };
    prev.count = Math.max(prev.count, Number(e.meta?.count ?? 1));
    dupMap.set(fp, prev);
  }
  const duplicates = [...dupMap.entries()]
    .map(([fingerprint, v]) => ({
      fingerprint,
      count: v.count,
      name: v.name,
      category: v.category,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    eventCount: events.length,
    averagePageLoadMs: avgOf(pageLoads.map((e) => e.durationMs)),
    averageAccountSwitchMs: avgOf(accountSwitches.map((e) => e.durationMs)),
    averageSmartPricingLoadMs: avgOf(smartPricing.map((e) => e.durationMs)),
    averageDashboardRefreshMs: avgOf(dashboardRefresh.map((e) => e.durationMs)),
    top10Longest,
    sql,
    wbApi,
    duplicates,
    slowestOperations: top10Longest.slice(0, 5),
  };
}

export function writePerfReportMarkdown(report: PerfReportSummary): string {
  ensureDir();
  const fmt = (n: number | null) => (n === null ? "—" : `${Math.round(n)} ms`);
  const lines = [
    "# Dashboard Performance Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Events: ${report.eventCount}`,
    "",
    "## Averages",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Average page load | ${fmt(report.averagePageLoadMs)} |`,
    `| Average account switch | ${fmt(report.averageAccountSwitchMs)} |`,
    `| Average Smart Pricing load | ${fmt(report.averageSmartPricingLoadMs)} |`,
    `| Average Dashboard refresh | ${fmt(report.averageDashboardRefreshMs)} |`,
    "",
    "## Top 10 longest tasks",
    "",
    `| # | Name | Category | Duration |`,
    `| --- | --- | --- | --- |`,
    ...report.top10Longest.map(
      (row, i) =>
        `| ${i + 1} | ${row.name} | ${row.category} | ${Math.round(row.durationMs)} ms |`
    ),
    "",
    "## SQL queries",
    "",
    `| Query | Avg duration | Avg rows | Count |`,
    `| --- | --- | --- | --- |`,
    ...report.sql
      .slice(0, 40)
      .map(
        (row) =>
          `| ${row.name} | ${Math.round(row.durationMs)} ms | ${row.rows} | ${row.count} |`
      ),
    "",
    "## Wildberries API",
    "",
    `| Endpoint | Avg duration | Retries | 429s | Cache | Count |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...report.wbApi.map(
      (row) =>
        `| ${row.endpoint} | ${Math.round(row.durationMs)} ms | ${row.retries} | ${row.count429} | ${row.cache} | ${row.count} |`
    ),
    "",
    "## Duplicate work",
    "",
    report.duplicates.length
      ? [
          `| Fingerprint | Times in request | Name |`,
          `| --- | --- | --- |`,
          ...report.duplicates.map(
            (row) => `| ${row.fingerprint} | ${row.count} | ${row.name} |`
          ),
        ].join("\n")
      : "_No duplicates recorded yet._",
    "",
    "## Slowest operations",
    "",
    ...report.slowestOperations.map(
      (row) => `- **${row.name}** (${row.category}): ${Math.round(row.durationMs)} ms`
    ),
    "",
    "---",
    "",
    "_Sprint 6.35.2 — instrumentation only. No optimizations applied._",
    "",
  ];
  const md = lines.join("\n");
  writeFileSync(join(perfDir(), "PERFORMANCE_REPORT.md"), md, "utf8");
  writeFileSync(join(perfDir(), "PERFORMANCE_REPORT.json"), JSON.stringify(report, null, 2), "utf8");
  return md;
}

export function clearPerfEvents(): void {
  memoryEvents.length = 0;
  try {
    ensureDir();
    writeFileSync(eventsPath(), "", "utf8");
  } catch {
    // ignore
  }
}
