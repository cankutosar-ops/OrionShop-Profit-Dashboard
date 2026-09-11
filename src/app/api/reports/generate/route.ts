import { parsePeriodPreset, periodPresetLabel } from "@/lib/reports/report-period";
import { exportReport } from "@/lib/reports/report-engine";
import { normalizeBrandId, scopeSearchParamsFromUrl } from "@/lib/filter-params";
import { parseDateRange } from "@/lib/utils";
import { buildBusinessReport } from "@/lib/reporting";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  buildBusinessWorkbookFilename,
  isBusinessDocumentEmpty,
  renderBusinessReportWorkbook,
} from "@/lib/reporting/excel";
import {
  buildWeeklyBusinessWorkbookModel,
  buildWeeklyWorkbookFilename,
  renderWeeklyBusinessWorkbook,
} from "@/lib/reporting/weekly-business";
import type { ScopedDateRange } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * Generate + download Excel.
 * weekly-business-excel → Unified Business Excel (any selected period; FE projections).
 * Business report → ReportDocument Excel Renderer (Sprint 8.0).
 * Product report → legacy ReportPayload workbook (until product Document sprint).
 */
export async function GET(request: Request) {
  try {
    const authz = await authorizeRequestScope(request, {
      allowDefaultAccount: true,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const url = new URL(request.url);
    const templateId = url.searchParams.get("templateId")?.trim();
    if (!templateId) {
      return Response.json({ error: "templateId is required" }, { status: 400 });
    }

    const versionRaw = url.searchParams.get("templateVersion");
    const templateVersion = versionRaw ? Number(versionRaw) : undefined;
    if (versionRaw && !Number.isFinite(templateVersion)) {
      return Response.json(
        { error: "templateVersion must be a number" },
        { status: 400 }
      );
    }

    const params = scopeSearchParamsFromUrl(url);
    const scope: ScopedDateRange = {
      ...parseDateRange(params.from || undefined, params.to || undefined),
      marketplaceAccountId: authz.marketplaceAccountId!,
      companyId: authz.companyId!,
      brandId: normalizeBrandId(params.brand || undefined),
    };
    const periodPreset = parsePeriodPreset(url.searchParams.get("periodPreset"));
    const locale =
      (url.searchParams.get("locale") as "en" | "ru" | "tr" | null) ?? "en";

    if (templateId === "weekly-business-excel") {
      const model = await buildWeeklyBusinessWorkbookModel(scope, {
        periodPresetLabel: periodPresetLabel(periodPreset),
        locale,
      });
      const body = await renderWeeklyBusinessWorkbook(model);
      const filename = buildWeeklyWorkbookFilename(model);

      return new Response(body, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          "X-Report-Engine": "weekly-business-excel",
          "X-Finance-Complete": model.dataQuality.financeComplete ? "1" : "0",
        },
      });
    }

    if (templateId === "business-report") {
      const document = await buildBusinessReport(scope, {
        periodPresetLabel: periodPresetLabel(periodPreset),
        locale,
      });

      if (isBusinessDocumentEmpty(document)) {
        return Response.json(
          {
            ok: false,
            code: "NO_DATA_FOR_PERIOD",
            messageKey: "report.error.noDataForPeriod",
            message: `No business data exists for the selected period (${scope.from} → ${scope.to}).`,
            scope,
          },
          { status: 422 }
        );
      }

      const body = await renderBusinessReportWorkbook(document);
      const filename = buildBusinessWorkbookFilename(document);

      return new Response(body, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          "X-Report-Engine": "report-document",
          "X-Report-Version": String(document.metadata.version),
        },
      });
    }

    const result = await exportReport({
      templateId,
      templateVersion,
      scope,
      periodPreset,
      locale,
      dataMode: "live",
    });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          code: result.code,
          messageKey: result.messageKey,
          message: result.message,
          scope: result.scope,
        },
        { status: 422 }
      );
    }

    return new Response(result.body, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
        "X-Report-Engine": "legacy-payload",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report";
    return Response.json({ error: message }, { status: 500 });
  }
}
