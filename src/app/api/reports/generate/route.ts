import { exportReport } from "@/lib/reports/report-engine";
import { parsePeriodPreset } from "@/lib/reports/report-template-registry";
import { resolveScopedDateRangeFromUrl } from "@/lib/marketplace-scope";

export const dynamic = "force-dynamic";

/**
 * Sprint 7.1 — generate + download Excel from Report Engine.
 * Query: templateId (required), optional templateVersion, periodPreset, locale + FILTER_PARAMS.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const templateId = url.searchParams.get("templateId")?.trim();
    if (!templateId) {
      return Response.json({ error: "templateId is required" }, { status: 400 });
    }

    const versionRaw = url.searchParams.get("templateVersion");
    const templateVersion = versionRaw ? Number(versionRaw) : undefined;
    if (versionRaw && !Number.isFinite(templateVersion)) {
      return Response.json({ error: "templateVersion must be a number" }, { status: 400 });
    }

    const scope = await resolveScopedDateRangeFromUrl(url);
    const result = await exportReport({
      templateId,
      templateVersion,
      scope,
      periodPreset: parsePeriodPreset(url.searchParams.get("periodPreset")),
      locale: (url.searchParams.get("locale") as "en" | "ru" | "tr" | null) ?? "en",
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
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report";
    return Response.json({ error: message }, { status: 500 });
  }
}
