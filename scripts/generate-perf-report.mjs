/**
 * Sprint 6.35.2 — Generate Dashboard Performance Report from .perf/timings.jsonl
 */
import { mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
const perfDir = resolve(root, ".perf");
if (!existsSync(perfDir)) mkdirSync(perfDir, { recursive: true });

const { buildPerfReport, writePerfReportMarkdown, loadAllPerfEvents } =
  await import("../src/lib/perf/perf-recorder.ts");

const events = loadAllPerfEvents();
const report = buildPerfReport(events);
const md = writePerfReportMarkdown(report);

console.log(`Events: ${report.eventCount}`);
console.log(`Wrote .perf/PERFORMANCE_REPORT.md`);
console.log(`Wrote .perf/PERFORMANCE_REPORT.json`);
console.log(`Average page load: ${report.averagePageLoadMs ?? "—"}`);
console.log(`Top longest: ${report.top10Longest[0]?.name ?? "—"}`);
if (process.env.PERF_REPORT_PREVIEW === "1") {
  console.log("\n--- preview ---\n");
  console.log(md.slice(0, 1500));
}
