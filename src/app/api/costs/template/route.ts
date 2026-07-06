import { buildCostTemplateFilename, buildCostTemplateWorkbook } from "@/lib/cost-excel";
import { resolveScopedDateRangeFromUrl } from "@/lib/marketplace-scope";
import { buildCostTemplateRows } from "@/services/cost-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const scope = await resolveScopedDateRangeFromUrl(new URL(request.url));

    const rows = await buildCostTemplateRows(scope.marketplaceAccountId);
    const buffer = buildCostTemplateWorkbook(rows);
    const filename = buildCostTemplateFilename();

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export cost template";
    return Response.json({ error: message }, { status: 500 });
  }
}
