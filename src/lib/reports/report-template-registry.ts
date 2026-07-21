import type {
  ReportPeriodPreset,
  ReportTemplateId,
  ReportTemplateStatus,
  ReportTemplateVersion,
} from "@/lib/reports/report-engine-types";
import {
  isBusinessReportEmpty,
  provideBusinessReportKpis,
} from "@/lib/reports/report-providers";
import type { ScopedDateRange } from "@/types/database";
import type { ReportSection } from "@/lib/reports/report-engine-types";

export type RegisteredReportTemplate = {
  templateId: ReportTemplateId;
  version: ReportTemplateVersion;
  createdAt: string;
  status: ReportTemplateStatus;
  reportName: string;
  buildSections: (scope: ScopedDateRange) => Promise<ReportSection[]>;
  isEmpty: (sections: ReportSection[]) => boolean;
};

const BUSINESS_REPORT_V1: RegisteredReportTemplate = {
  templateId: "business-report",
  version: 1,
  createdAt: "2026-07-21",
  status: "active",
  reportName: "Business Report",
  async buildSections(scope) {
    const kpis = await provideBusinessReportKpis(scope);
    return [kpis];
  },
  isEmpty(sections) {
    const kpis = sections.find((s) => s.id === "business-kpis");
    if (!kpis) return true;
    return isBusinessReportEmpty(kpis.data as Parameters<typeof isBusinessReportEmpty>[0]);
  },
};

const REGISTRY: RegisteredReportTemplate[] = [BUSINESS_REPORT_V1];

export function getReportTemplate(
  templateId: ReportTemplateId,
  templateVersion?: ReportTemplateVersion
): RegisteredReportTemplate {
  const matches = REGISTRY.filter(
    (entry) => entry.templateId === templateId && entry.status !== "deprecated"
  );

  if (matches.length === 0) {
    throw new Error(`Unknown report template: ${templateId}`);
  }

  if (templateVersion != null) {
    const pinned = matches.find((entry) => entry.version === templateVersion);
    if (!pinned) {
      throw new Error(
        `Report template "${templateId}" version ${templateVersion} not found`
      );
    }
    return pinned;
  }

  const active = matches
    .filter((entry) => entry.status === "active")
    .sort((a, b) => b.version - a.version)[0];

  if (!active) {
    throw new Error(`No active version for report template: ${templateId}`);
  }

  return active;
}

export function listReportTemplates(): RegisteredReportTemplate[] {
  return [...REGISTRY];
}

export function parsePeriodPreset(value: string | null | undefined): ReportPeriodPreset | undefined {
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
