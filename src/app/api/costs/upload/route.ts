import { NextResponse } from "next/server";
import { parseCostExcel } from "@/lib/cost-excel";
import { resolveScopedDateRangeFromUrl } from "@/lib/marketplace-scope";
import { bulkImportCostRecords } from "@/services/cost-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const scope = await resolveScopedDateRangeFromUrl(new URL(request.url));

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required (.xlsx)" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "Only .xlsx files are supported" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const rows = parseCostExcel(buffer);
    const result = await bulkImportCostRecords(rows, scope.marketplaceAccountId);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import costs";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
