import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  fetchHistoricalInventoryForExport,
  listAvailableSnapshotDates,
} from "@/services/historical-inventory-service";
import type { HistoricalInventorySortField } from "@/lib/historical-inventory-types";
import { isTransitAvailableForSnapshot } from "@/lib/inventory-history-table";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/inventory/history/export
 * Excel for the current account + date + filters (from DB, not regenerated archives).
 * Transit columns only when exporting the Latest live Analytics snapshot.
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  const marketplaceAccountId = authz.marketplaceAccountId!;
  const url = new URL(request.url);
  const snapshotDate = url.searchParams.get("snapshotDate")?.trim();

  if (!snapshotDate) {
    return NextResponse.json(
      { error: "snapshotDate is required" },
      { status: 400 }
    );
  }

  try {
    const warehouse = url.searchParams.get("warehouse");
    const search = url.searchParams.get("q") ?? url.searchParams.get("search");
    const sortBy = (url.searchParams.get("sortBy") ??
      "warehouse_name") as HistoricalInventorySortField;
    const sortDir = url.searchParams.get("sortDir") === "desc" ? "desc" : "asc";

    const [rows, availableDates] = await Promise.all([
      fetchHistoricalInventoryForExport({
        marketplaceAccountId,
        snapshotDate,
        warehouse,
        search,
        sortBy,
        sortDir,
      }),
      listAvailableSnapshotDates(marketplaceAccountId),
    ]);

    const isLatest = availableDates[0] === snapshotDate;
    const includeTransit =
      isLatest && isTransitAvailableForSnapshot(rows);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Orion Inventory History";
    const ws = wb.addWorksheet("Inventory");
    ws.columns = [
      { header: "Brand", key: "brand", width: 16 },
      { header: "Subject", key: "subject", width: 18 },
      { header: "Seller Article", key: "seller_article", width: 22 },
      { header: "WB Article", key: "nm_id", width: 14 },
      { header: "Barcode", key: "barcode", width: 16 },
      { header: "Size", key: "size", width: 12 },
      { header: "Warehouse", key: "warehouse_name", width: 28 },
      { header: "Quantity", key: "quantity", width: 12 },
      ...(includeTransit
        ? [
            { header: "To Customer", key: "in_way_to_client", width: 14 },
            { header: "From Customer", key: "in_way_from_client", width: 14 },
          ]
        : []),
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow({
        brand: r.brand,
        subject: r.subject,
        seller_article: r.seller_article,
        nm_id: r.nm_id,
        barcode: r.barcode || "",
        size: r.size,
        warehouse_name: r.warehouse_name,
        quantity: r.quantity,
        ...(includeTransit
          ? {
              in_way_to_client: r.in_way_to_client ?? 0,
              in_way_from_client: r.in_way_from_client ?? 0,
            }
          : {}),
      });
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const filename = `inventory-history-${marketplaceAccountId}-${snapshotDate}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
