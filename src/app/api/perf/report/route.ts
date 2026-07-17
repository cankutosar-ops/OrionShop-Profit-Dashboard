import { NextResponse } from "next/server";
import {
  buildPerfReport,
  clearPerfEvents,
  loadAllPerfEvents,
  writePerfReportMarkdown,
} from "@/lib/perf/perf-recorder";

export const dynamic = "force-dynamic";

/** Generate / return the performance report. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clear = url.searchParams.get("clear") === "1";
  const events = loadAllPerfEvents();
  const report = buildPerfReport(events);
  const markdown = writePerfReportMarkdown(report);

  if (clear) clearPerfEvents();

  return NextResponse.json({
    ok: true,
    report,
    markdownPath: ".perf/PERFORMANCE_REPORT.md",
    jsonPath: ".perf/PERFORMANCE_REPORT.json",
    markdownPreview: markdown.slice(0, 2000),
  });
}
