import type { OverallVerificationStatus, SourceVerification, SyncVerificationReport } from "./types";

function formatRange(earliest: string | null, latest: string | null): string {
  if (!earliest && !latest) return "(no data)";
  if (earliest && latest) return `${earliest} → ${latest}`;
  return earliest ?? latest ?? "(no data)";
}

export function formatVerificationSummary(input: {
  sources: SourceVerification[];
  overall: OverallVerificationStatus;
}): string {
  const lines: string[] = [];

  for (const source of input.sources) {
    lines.push(source.label);
    lines.push(`DB Range:`);
    lines.push(formatRange(source.earliestDate, source.latestDate));
    lines.push(`Records: ${source.recordCount}`);
    if (source.lastSyncAt) {
      lines.push(`Last sync: ${source.lastSyncAt}`);
    }
    if (source.status === "healthy") {
      lines.push("Healthy");
    } else if (source.warning) {
      lines.push(`Warning:`);
      lines.push(source.warning);
    } else {
      lines.push("Warning");
    }
    lines.push("");
  }

  lines.push("Overall:");
  lines.push(input.overall === "healthy" ? "Verification Healthy" : "Verification Warning");

  return lines.join("\n").trimEnd();
}

export function buildOverallStatus(sources: SourceVerification[]): OverallVerificationStatus {
  return sources.some((s) => s.status !== "healthy") ? "warning" : "healthy";
}

export function attachSummary(report: Omit<SyncVerificationReport, "summaryText">): SyncVerificationReport {
  return {
    ...report,
    summaryText: formatVerificationSummary({
      sources: report.sources,
      overall: report.overall,
    }),
  };
}
