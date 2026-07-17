import {
  resolveNetSalesFromSources,
  type NetSalesResolution,
} from "@/lib/sales-revenue-resolution";
import type { ScopedDateRange, WbSale } from "@/types/database";

/** Model B net sales from persisted wb_sales.price_with_disc only — no live Sales API. */
export async function resolveNetSales(
  scope: ScopedDateRange,
  sales: WbSale[]
): Promise<NetSalesResolution> {
  return resolveNetSalesFromSources({
    sales,
    scopeFrom: scope.from,
    scopeTo: scope.to,
  });
}

/** @deprecated Use resolveNetSales */
export async function resolveSalesPriceWithDisc(
  scope: ScopedDateRange,
  sales: WbSale[]
): Promise<NetSalesResolution> {
  return resolveNetSales(scope, sales);
}
