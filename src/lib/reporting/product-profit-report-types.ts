/**
 * Client-safe Product Profit report row DTO (presentation only).
 */

export type ProductProfitReportRow = {
  productId: string;
  sku: string;
  model: string;
  brand: string;
  revenue: number;
  orders: number;
  purchases: number;
  marketplaceFee: number;
  logistics: number;
  advertising: number;
  productCost: number;
  netProfit: number;
  marginPercent: number;
};
