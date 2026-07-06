import { NextResponse } from "next/server";
import { resolveScopedDateRangeFromUrl } from "@/lib/marketplace-scope";
import { fetchCostManagementRows } from "@/services/cost-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const scope = await resolveScopedDateRangeFromUrl(new URL(request.url));

    const rows = await fetchCostManagementRows(scope);
    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch cost rows";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
