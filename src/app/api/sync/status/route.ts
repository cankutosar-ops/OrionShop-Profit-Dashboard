import { NextResponse } from "next/server";
import { getDashboardSyncStatus } from "@/services/sync-job-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const marketplaceAccountId = new URL(request.url).searchParams.get("marketplaceAccountId");

  if (!marketplaceAccountId) {
    return NextResponse.json(
      { error: "marketplaceAccountId query parameter is required" },
      { status: 400 }
    );
  }

  const status = await getDashboardSyncStatus(marketplaceAccountId);
  return NextResponse.json(status);
}
