import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { normalizeBrandId } from "@/lib/filter-params";
import { getWarehouseSalesAnalytics } from "@/services/warehouse-sales-analytics-service";
import { renderWarehouseSalesCsv, renderWarehouseSalesWorkbook, selectWarehouseReportRows } from "@/lib/warehouse-sales-report-export";
import type { ScopedDateRange } from "@/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;
  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date && date < "9999-12-31";
  const format = params.get("format") ?? "xlsx";
  if (!validDate(from) || !validDate(to) || from > to || !["xlsx", "csv"].includes(format)) {
    return NextResponse.json({ error: "Valid from/to dates and xlsx/csv format are required" }, { status: 400 });
  }
  const scope: ScopedDateRange = { from, to, companyId: authz.companyId!, marketplaceAccountId: authz.marketplaceAccountId!, brandId: normalizeBrandId(params.get("brand")) };
  const warehouse = params.get("warehouse")?.trim() || null;
  const search = params.get("q")?.trim() || null;
  try {
    const report = await getWarehouseSalesAnalytics(scope, { includeAllProducts: true });
    if (!report) return NextResponse.json({ error: "Report data is unavailable" }, { status: 503 });
    const rows = selectWarehouseReportRows(report.warehouseProducts ?? [], warehouse, search);
    const body = format === "csv" ? renderWarehouseSalesCsv(rows) : await renderWarehouseSalesWorkbook(rows, scope, warehouse, search);
    return new NextResponse(body, { headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="warehouse-product-sales-${scope.marketplaceAccountId}-${from}-${to}.${format}"`,
      "Cache-Control": "no-store",
    } });
  } catch {
    return NextResponse.json({ error: "Warehouse sales export failed" }, { status: 500 });
  }
}
