import { isWithinDateRange, toDateString } from "@/lib/wildberries/mappers";
import type { WbSale } from "@/types/database";
import type { WbApiSale } from "@/lib/wildberries/types";

export type NetSalesBreakdown = {
  /** Sum of priceWithDisc on completed (non-return) sales. */
  grossSales: number;
  /** Sum of priceWithDisc on return sales (positive magnitude). */
  returnedSales: number;
  /** grossSales − returnedSales — Model B revenue. */
  netSales: number;
};

export type SalesPriceWithDiscDataSource = "db" | "sales_api";

/** Whether Net Sales (Model B revenue) is safe to display. */
export type NetSalesStatus = "ready" | "unavailable" | "empty";

export type NetSalesResolution = NetSalesBreakdown & {
  dataSource: SalesPriceWithDiscDataSource;
  status: NetSalesStatus;
};

function sumPriceWithDiscFromDbByReturnFlag(sales: WbSale[], isReturn: boolean): number {
  return sales
    .filter((sale) => sale.is_return === isReturn)
    .reduce(
      (sum, sale) => sum + Math.abs(Number(sale.price_with_disc ?? 0)) * sale.quantity,
      0
    );
}

function sumForPayFromDbByReturnFlag(sales: WbSale[], isReturn: boolean): number {
  return sales
    .filter((sale) => sale.is_return === isReturn)
    .reduce((sum, sale) => sum + Math.abs(Number(sale.for_pay ?? 0)) * sale.quantity, 0);
}

function sumFinishedPriceFromDbByReturnFlag(sales: WbSale[], isReturn: boolean): number {
  return sales
    .filter((sale) => sale.is_return === isReturn)
    .reduce((sum, sale) => {
      // wb_sales.revenue persists Sales API finishedPrice (see mapApiSaleToDb).
      return sum + Math.abs(Number(sale.revenue ?? 0)) * sale.quantity;
    }, 0);
}

/**
 * Net customer-paid amount = Σ finishedPrice (purchases − returns).
 * Tax base for Estimated Tax — never priceWithDisc / forPay / ppvz_for_pay.
 */
export function buildNetFinishedPriceFromDb(sales: WbSale[]): number {
  return (
    sumFinishedPriceFromDbByReturnFlag(sales, false) -
    sumFinishedPriceFromDbByReturnFlag(sales, true)
  );
}

/** Σ finishedPrice on return rows — display KPI (amount refunded to customers). */
export function sumReturnedFinishedPriceFromDb(sales: WbSale[]): number {
  return sumFinishedPriceFromDbByReturnFlag(sales, true);
}

/** Net Sales API forPay from persisted wb_sales.for_pay. */
export function buildNetForPayFromDb(sales: WbSale[]): number {
  return sumForPayFromDbByReturnFlag(sales, false) - sumForPayFromDbByReturnFlag(sales, true);
}

/** Net Sales from persisted wb_sales.price_with_disc (historical Sales API values). */
export function buildNetSalesFromDb(sales: WbSale[]): NetSalesBreakdown {
  const grossSales = sumPriceWithDiscFromDbByReturnFlag(sales, false);
  const returnedSales = sumPriceWithDiscFromDbByReturnFlag(sales, true);
  return {
    grossSales,
    returnedSales,
    netSales: grossSales - returnedSales,
  };
}

/** Net Sales from raw Sales API rows for the dashboard date range. */
export function buildNetSalesFromApiSales(
  apiSales: WbApiSale[],
  scopeFrom: string,
  scopeTo: string
): NetSalesBreakdown {
  let grossSales = 0;
  let returnedSales = 0;

  for (const sale of apiSales) {
    if (!isWithinDateRange(toDateString(sale.date), scopeFrom, scopeTo)) continue;
    const amount = Math.abs(sale.priceWithDisc ?? 0);
    if (sale.saleID.startsWith("R")) {
      returnedSales += amount;
    } else {
      grossSales += amount;
    }
  }

  return {
    grossSales,
    returnedSales,
    netSales: grossSales - returnedSales,
  };
}

/**
 * True when any persisted sale/return price is still zero or invalid.
 * WB may fill priceWithDisc asynchronously; one priced row cannot establish
 * completeness for the rest of the period.
 */
export function netSalesNeedsApiFallback(sales: WbSale[]): boolean {
  return sales.some((sale) => {
    const price = Number(sale.price_with_disc);
    return !Number.isFinite(price) || price <= 0;
  });
}

const EMPTY_NET_SALES: NetSalesBreakdown = {
  grossSales: 0,
  returnedSales: 0,
  netSales: 0,
};

export function resolveNetSalesFromSources(params: {
  sales: WbSale[];
  scopeFrom: string;
  scopeTo: string;
}): NetSalesResolution {
  return resolveNetSalesFromDb(params.sales);
}

/** Shared readiness rule for persisted Sales at account and product grain. */
export function resolveNetSalesFromDb(sales: WbSale[]): NetSalesResolution {
  if (sales.length === 0) {
    return { ...EMPTY_NET_SALES, dataSource: "db", status: "empty" };
  }

  const fromDb = buildNetSalesFromDb(sales);

  if (!netSalesNeedsApiFallback(sales)) {
    return { ...fromDb, dataSource: "db", status: "ready" };
  }

  // Keep the observed amount for existing arithmetic; status consumers must
  // not present partial price coverage as ready.
  return { ...fromDb, dataSource: "db", status: "unavailable" };
}

export function isNetSalesReady(status: NetSalesStatus): boolean {
  return status === "ready";
}

/** @deprecated Use buildNetSalesFromDb().netSales */
export function sumSalesPriceWithDiscFromDb(sales: WbSale[]): number {
  return buildNetSalesFromDb(sales).netSales;
}

/** Share of active-model revenue for KPI subtitles. */
export function shareOfRevenueBasePercent(revenueBase: number, amount: number): number {
  if (revenueBase <= 0) return 0;
  return (amount / revenueBase) * 100;
}
