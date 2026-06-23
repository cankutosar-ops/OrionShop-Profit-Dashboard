import { NextResponse } from "next/server";
import { wbSyncService } from "@/lib/wildberries";

/**
 * POST /api/sync
 *
 * Future endpoint for triggering Wildberries data sync.
 * Not yet functional — returns a placeholder response.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { dateFrom, dateTo, entities } = body as {
      dateFrom?: string;
      dateTo?: string;
      entities?: string[];
    };

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "dateFrom and dateTo are required" },
        { status: 400 }
      );
    }

    const results = await wbSyncService.syncAll({
      dateFrom,
      dateTo,
      entities: entities as Parameters<typeof wbSyncService.syncAll>[0]["entities"],
    });

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 501 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "not_implemented",
    message: "Wildberries API sync is not yet connected. Configure WB_API_TOKEN to enable.",
  });
}
