import { buildPurchaseTemplateFilename, buildPurchaseTemplateWorkbook } from "@/lib/purchase-excel";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { buildPurchaseTemplateRows } from "@/services/purchase-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authz = await authorizeRequestScope(request, {
      allowDefaultAccount: true,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const rows = await buildPurchaseTemplateRows(authz.marketplaceAccountId!);
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
