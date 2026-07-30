import { readFileSync } from "fs";
import { basename } from "path";
import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  resolveDayRawCsvPath,
  resolveOriginalCsvPath,
} from "@/services/historical-inventory-import-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory/history/original
 * Returns archived WB CSV (wide source) or day raw.csv — filesystem archive only.
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  const marketplaceAccountId = authz.marketplaceAccountId!;
  const url = new URL(request.url);
  const snapshotDate = url.searchParams.get("snapshotDate")?.trim();
  const preferDay = url.searchParams.get("dayRaw") === "1";

  try {
    let path: string | null = null;
    if (preferDay && snapshotDate) {
      path = resolveDayRawCsvPath(marketplaceAccountId, snapshotDate);
    }
    if (!path) {
      path = resolveOriginalCsvPath(marketplaceAccountId);
    }
    if (!path && snapshotDate) {
      path = resolveDayRawCsvPath(marketplaceAccountId, snapshotDate);
    }

    if (!path) {
      return NextResponse.json(
        { error: "Archived original CSV not found for this account" },
        { status: 404 }
      );
    }

    const buf = readFileSync(path);
    const name = basename(path);
    const isZip = name.toLowerCase().endsWith(".zip");

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": isZip ? "application/zip" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 500 }
    );
  }
}
