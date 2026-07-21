import type {
  ReportTemplateId,
  ReportTemplateStatus,
  ReportTemplateVersion,
} from "@/lib/reports/report-engine-types";
import {
  isBusinessReportEmpty,
  provideBusinessReportSections,
} from "@/lib/reports/report-providers";
import type { ScopedDateRange } from "@/types/database";
import type {
  BusinessExecutiveSummaryData,
  ReportSection,
} from "@/lib/reports/report-engine-types";

export type RegisteredReportTemplate = {
  templateId: ReportTemplateId;
  version: ReportTemplateVersion;
  createdAt: string;
  status: ReportTemplateStatus;
  reportName: string;
  buildSections: (scope: ScopedDateRange) => Promise<ReportSection[]>;
  isEmpty: (sections: ReportSection[]) => boolean;
};

const BUSINESS_REPORT_V2: RegisteredReportTemplate = {
  templateId: "business-report",
  version: 2,
  createdAt: "2026-07-21",
  status: "active",
  reportName: "Business Report",
  async buildSections(scope) {
    return provideBusinessReportSections(scope);
  },
  isEmpty(sections) {
    const executive = sections.find((s) => s.id === "executive-summary");
    if (!executive) return true;
    return isBusinessReportEmpty(
      executive.data as BusinessExecutiveSummaryData
    );
  },
};

/** Sprint 7.1 foundation template — retained for version pinning. */
const BUSINESS_REPORT_V1: RegisteredReportTemplate = {
  templateId: "business-report",
  version: 1,
  createdAt: "2026-07-21",
  status: "deprecated",
  reportName: "Business Report",
  async buildSections(scope) {
    return provideBusinessReportSections(scope);
  },
  isEmpty(sections) {
    return BUSINESS_REPORT_V2.isEmpty(sections);
  },
};

const REGISTRY: RegisteredReportTemplate[] = [BUSINESS_REPORT_V2, BUSINESS_REPORT_V1];

export function getReportTemplate(
  templateId: ReportTemplateId,
  templateVersion?: ReportTemplateVersion
): RegisteredReportTemplate {
  const matches = REGISTRY.filter((entry) => entry.templateId === templateId);

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

export {
  inferPeriodPreset,
  parsePeriodPreset,
} from "@/lib/reports/report-period";
