"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  markNavigationComplete,
  recordClientPerf,
} from "@/lib/perf/perf-client";

/**
 * Records page-ready timings after client hydration (Sprint 6.35.2).
 * Presentation/instrumentation only.
 */
export function PerfPageProbe() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      recordClientPerf({
        category: "react",
        name: "react.hydration",
        durationMs: Math.round(performance.now()),
        route: pathname,
      });
    }
  }, [pathname]);

  useEffect(() => {
    const key = `${pathname}?${searchParams.toString()}`;
    if (lastKeyRef.current === key) return;
    const isFirst = lastKeyRef.current === null;
    lastKeyRef.current = key;

    const readyName =
      pathname === "/"
        ? isFirst
          ? "page.dashboard.ready"
          : "page.dashboard.refresh"
        : pathname.startsWith("/analytics/pricing")
          ? "page.smart_pricing.ready"
          : pathname.startsWith("/costs")
            ? "page.costs.ready"
            : pathname.startsWith("/reports")
              ? "page.reports.ready"
              : "page.ready";

    // Yield so paint can complete, then mark interactive
    const started = performance.now();
    const raf = requestAnimationFrame(() => {
      recordClientPerf({
        category: "page",
        name: readyName,
        durationMs: Math.round(performance.now() - started),
        route: pathname,
        meta: {
          interactive: true,
          search: searchParams.toString(),
          firstLoad: isFirst,
        },
      });
      recordClientPerf({
        category: "react",
        name: "react.page_interactive",
        durationMs: Math.round(performance.now()),
        route: pathname,
      });
      markNavigationComplete();
    });

    return () => cancelAnimationFrame(raf);
  }, [pathname, searchParams]);

  return null;
}
