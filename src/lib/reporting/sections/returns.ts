/**
 * Returns Analysis — quantity metrics + highest-return brands/SKUs from context.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import { rankProductsBy, type RankedProduct } from "@/lib/reporting/section-utils";

const TOP_N = 10;

export type ReturnBrandRow = {
  brandName: string;
  unitsReturned: number;
  unitsSold: number;
  returnRate: number;
};

export type ReturnsData = {
  returnedUnits: number;
  returnedValue: number;
  returnedSales: number;
  returnRate: number;
  unitsSold: number;
  netUnits: number;
  highestReturnBrands: ReturnBrandRow[];
  highestReturnSkus: RankedProduct[];
};

export function buildReturnsSection(
  ctx: ReportContext
): ReportSection<ReturnsData> {
  const fe = ctx.financialEngine;
  const qty = ctx.overview.quantityMetrics;
  const op = ctx.overview.ordersPurchases;

  const brandReturnRate = new Map(
    ctx.brands.map((b) => [b.name, b.returnRate] as const)
  );

  const brandAcc = new Map<
    string,
    { brandName: string; unitsReturned: number; unitsSold: number }
  >();

  for (const product of ctx.products) {
    const key = product.brandName?.trim() || "Unassigned";
    const acc = brandAcc.get(key) ?? {
      brandName: key,
      unitsReturned: 0,
      unitsSold: 0,
    };
    acc.unitsReturned += product.unitsReturned;
    acc.unitsSold += product.unitsSold;
    brandAcc.set(key, acc);
  }

  const highestReturnBrands = [...brandAcc.values()]
    .map((row) => ({
      brandName: row.brandName,
      unitsReturned: row.unitsReturned,
      unitsSold: row.unitsSold,
      /** Dashboard brand returnRate when available; otherwise 0. */
      returnRate: brandReturnRate.get(row.brandName) ?? 0,
    }))
    .sort((a, b) => b.unitsReturned - a.unitsReturned)
    .slice(0, TOP_N);

  return {
    id: "returns",
    kind: "returns",
    title: "Returns Analysis",
    description: "Return volume, value, and highest-return brands/SKUs",
    data: {
      returnedUnits: qty.unitsReturned,
      returnedValue: qty.returnedValue,
      returnedSales: fe.returnedSales,
      returnRate: op.returnRate,
      unitsSold: qty.unitsSold,
      netUnits: qty.netUnits,
      highestReturnBrands,
      highestReturnSkus: rankProductsBy(ctx.products, (p) => p.unitsReturned, TOP_N),
    },
  };
}
