/**
 * Client-side performance event helpers (Sprint 6.35.2).
 */
"use client";

import type { PerfCategory } from "@/lib/perf/types";

type ClientPerfPayload = {
  category: PerfCategory;
  name: string;
  durationMs: number;
  route?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

export function recordClientPerf(event: ClientPerfPayload): void {
  if (typeof window === "undefined") return;
  if (process.env.NEXT_PUBLIC_PERF_AUDIT === "0") return;

  const body = JSON.stringify({
    ...event,
    ts: Date.now(),
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/perf/events", blob);
      return;
    }
  } catch {
    // fall through
  }

  void fetch("/api/perf/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function markNavigationStart(kind: string): number {
  const started = performance.now();
  try {
    sessionStorage.setItem(
      "orionshop.perf.nav",
      JSON.stringify({ kind, startedAt: Date.now(), perfStart: started })
    );
  } catch {
    // ignore
  }
  recordClientPerf({
    category: "url",
    name: `url.${kind}`,
    durationMs: 0,
    route: window.location.pathname,
    meta: { phase: "start" },
  });
  return started;
}

export function markNavigationComplete(kindHint?: string): void {
  let kind = kindHint ?? "navigation";
  let startedAt = Date.now();
  let perfStart = performance.now();
  try {
    const raw = sessionStorage.getItem("orionshop.perf.nav");
    if (raw) {
      const parsed = JSON.parse(raw) as {
        kind?: string;
        startedAt?: number;
        perfStart?: number;
      };
      kind = parsed.kind ?? kind;
      startedAt = parsed.startedAt ?? startedAt;
      perfStart = parsed.perfStart ?? perfStart;
      sessionStorage.removeItem("orionshop.perf.nav");
    }
  } catch {
    // ignore
  }

  const durationMs = Math.max(0, Date.now() - startedAt);
  recordClientPerf({
    category: "navigation",
    name: `nav.${kind}`,
    durationMs,
    route: window.location.pathname,
    meta: {
      clientElapsedMs: Math.round(performance.now() - perfStart),
      phase: "complete",
    },
  });
}
