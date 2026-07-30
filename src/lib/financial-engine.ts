/**
 * Financial Engine V4 — Commercial Performance / historical reporting.
 *
 * Sales / Marketplace Fee / Revenue / Net Profit for Dashboard, Product Analytics,
 * and Reports go through this module.
 *
 * Estimated Tax (REPORTING only):
 *   Tax% × Σ finishedPrice
 *
 * Smart Pricing uses a DIFFERENT tax base (Sale − Marketplace Fee) on purpose.
 * See docs/estimated-tax-models.md and .cursor/rules/estimated-tax-dual-model.mdc.
 *
 * Sales            = Σ priceWithDisc
 * Marketplace Fee  = Sales − Sales API forPay
 * Acquiring        = Σ acquiring_fee          (display; never deducted after Revenue)
 * Revenue          = Σ ppvz_for_pay
 * Estimated Tax    = Tax% × Σ finishedPrice   (historical reporting)
 * Net Profit       = Revenue − PC − Logistics − Storage − Acceptance
 *                    − Penalties − Other − Advertising − Estimated Tax
 */

export {
  calculateModelBNetProfit as calculateCommercialPerformance,
  buildModelBProfitMetrics as buildCommercialPerformance,
  buildModelBBreakdownLines as buildCommercialPerformanceBreakdown,
  verifyModelBFinalProfitArithmetic as verifyNetProfitArithmetic,
  verifyModelBProfitArithmetic as verifyOperatingProfitArithmetic,
  calculateModelBMarginPercent as calculateNetMarginPercentOfSales,
  shareOfNetSalesPercent,
  calculateModelBNetProfit,
  buildModelBProfitMetrics,
  buildModelBBreakdownLines,
  verifyModelBFinalProfitArithmetic,
  verifyModelBProfitArithmetic,
  calculateModelBMarginPercent,
} from "@/lib/profit-engine-model-b";

export type { ModelBTaxParams as FinancialEngineTaxParams } from "@/lib/profit-engine-model-b";

import {
  buildNetFinishedPriceFromDb,
  buildNetForPayFromDb,
  buildNetSalesFromDb,
} from "@/lib/sales-revenue-resolution";
import {
  sumAcceptanceFromFinance,
  sumNetForPayFromFinance,
} from "@/lib/wb-settlement";
import type { WbFinance, WbSale } from "@/types/database";
import { calculateEstimatedTax } from "@/lib/financial-engine-tax";

export { calculateEstimatedTax } from "@/lib/financial-engine-tax";

/** Marketplace Fee = max(0, Sales − Sales API forPay). Never from ppvz_*. */
export function marketplaceFeeFromSales(netSales: number, salesForPay: number): number {
  return Math.max(0, netSales - salesForPay);
}

/** Net Σ finishedPrice from persisted sales (wb_sales.revenue = finishedPrice). */
export function sumCustomerPaidFromSales(sales: WbSale[]): number {
  return buildNetFinishedPriceFromDb(sales);
}

/**
 * finishedPrice / priceWithDisc ratio for unit pricing.
 * Tax at price P = Tax% × P × ratio (ratio from historical finishedPrice÷priceWithDisc).
 */
export function finishedPriceRatioFromSales(sales: WbSale[]): number | null {
  const netSales = buildNetSalesFromDb(sales).netSales;
  const customerPaid = buildNetFinishedPriceFromDb(sales);
  if (netSales <= 0 || customerPaid <= 0) return null;
  return customerPaid / netSales;
}

/** Sales + Marketplace Fee + customer paid from a sales set. */
export function sumSalesAndMarketplaceFee(sales: WbSale[]): {
  netSales: number;
  salesForPay: number;
  marketplaceFee: number;
  customerPaid: number;
  unitsSold: number;
} {
  const { netSales } = buildNetSalesFromDb(sales);
  const salesForPay = buildNetForPayFromDb(sales);
  const customerPaid = buildNetFinishedPriceFromDb(sales);
  const completed = sales.filter((row) => !row.is_return);
  const unitsSold = completed.reduce((sum, row) => sum + row.quantity, 0);
  return {
    netSales,
    salesForPay,
    marketplaceFee: marketplaceFeeFromSales(netSales, salesForPay),
    customerPaid,
    unitsSold,
  };
}

/** Revenue = Finance Σ ppvz_for_pay (signed for_pay lines). */
export function sumRevenueFromFinance(finance: WbFinance[]): number {
  return sumNetForPayFromFinance(finance);
}

/** Acceptance = Finance Σ|acceptance|. */
export function sumAcceptance(finance: WbFinance[]): number {
  return sumAcceptanceFromFinance(finance);
}

/** Unit commercial amount for fee weighting — prefer price_with_disc. */
export function saleUnitSalesAmount(sale: WbSale): number {
  const priceWithDisc = Number(sale.price_with_disc);
  if (Number.isFinite(priceWithDisc) && priceWithDisc > 0) {
    return Math.abs(priceWithDisc) * sale.quantity;
  }
  return Math.abs(Number(sale.revenue ?? 0));
}

/** Daily Sales series (priceWithDisc). */
export function sumDailySalesAmount(sales: WbSale[]): number {
  return sales.reduce((sum, sale) => {
    if (sale.is_return) return sum;
    return sum + saleUnitSalesAmount(sale);
  }, 0);
}
