import { buildPurchaseTemplateFilename, buildPurchaseTemplateWorkbook } from "@/lib/purchase-excel";
import { resolveScopedDateRangeFromUrl } from "@/lib/marketplace-scope";
import { buildPurchaseTemplateRows } from "@/services/purchase-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const scope = await resolveScopedDateRangeFromUrl(new URL(request.url));

    const rows = await buildPurchaseTemplateRows(scope.marketplaceAccountId);
    const buffer = buildPurchaseTemplateWorkbook(rows);
    const filename = buildPurchaseTemplateFilename();

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export purchase template";
    return Response.json({ error: message }, { status: 500 });
  }
}
