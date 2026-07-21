import type { ReportPeriodPreset } from "@/lib/reports/report-engine-types";

export function parsePeriodPreset(
  value: string | null | undefined
): ReportPeriodPreset | undefined {
  if (!value) return undefined;
  const allowed: ReportPeriodPreset[] = [
    "weekly",
    "monthly",
    "quarterly",
    "last_6_months",
    "yearly",
    "custom",
  ];
  return allowed.includes(value as ReportPeriodPreset)
    ? (value as ReportPeriodPreset)
    : undefined;
}

/** Infer preset label from inclusive day span (metadata only — does not change data). */
export function inferPeriodPreset(from: string, to: string): ReportPeriodPreset {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days =
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  if (days <= 8) return "weekly";
  if (days <= 35) return "monthly";
  if (days <= 100) return "quarterly";
  if (days <= 200) return "last_6_months";
  if (days <= 380) return "yearly";
  return "custom";
}
