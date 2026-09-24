/** Read-only diagnostic bridge. It never changes V4 or historical rows. */
export type RealizedPricingFacts = {
  netUnits: number;
  saleUnits: number;
  netSales: number;
  salesForPay: number;
  financeForPay: number;
  logistics: number;
  storage: number;
  acceptance: number;
  penalties: number;
  adjustments: number;
  advertising: number;
  productCost: number;
  tax: number;
  finalNetProfit: number;
};

export type ExpectedPricingAssumptions = {
  salePrice: number;
  marketplaceFeesPercent: number;
  baseLogistics: number;
  returnBurden: number;
  storage: number;
  productCost: number;
  advertisingPercent: number;
  taxPercent: number;
};

export type PricingProfitBridge = {
  expected: number;
  changes: Record<
    | "price" | "salesApiFee" | "salesToFinanceSettlement" | "baseLogistics"
    | "returnBurden" | "storage" | "productCost" | "advertising"
    | "acceptancePenaltiesAdjustments" | "tax",
    number
  >;
  reconstructed: number;
  realized: number;
  unresolved: number;
};

export function buildPricingProfitBridge(
  expected: ExpectedPricingAssumptions,
  actual: RealizedPricingFacts
): PricingProfitBridge | null {
  if (actual.netUnits <= 0 || actual.saleUnits <= 0) return null;
  const n = actual.netUnits;
  const actualBaseLogistics = actual.logistics / actual.saleUnits;
  const actualReturnBurden = actual.logistics / n - actualBaseLogistics;
  const expectedFee = expected.salePrice * expected.marketplaceFeesPercent / 100;
  const expectedTax = (expected.salePrice - expectedFee) * expected.taxPercent / 100;
  const expectedProfit = expected.salePrice - expectedFee - expected.baseLogistics
    - expected.returnBurden - expected.storage - expected.productCost
    - expected.salePrice * expected.advertisingPercent / 100 - expectedTax;
  const changes = {
    price: actual.netSales / n - expected.salePrice,
    salesApiFee: expectedFee - (actual.netSales - actual.salesForPay) / n,
    salesToFinanceSettlement: (actual.financeForPay - actual.salesForPay) / n,
    baseLogistics: expected.baseLogistics - actualBaseLogistics,
    returnBurden: expected.returnBurden - actualReturnBurden,
    storage: expected.storage - actual.storage / n,
    productCost: expected.productCost - actual.productCost / n,
    advertising: expected.salePrice * expected.advertisingPercent / 100 - actual.advertising / n,
    acceptancePenaltiesAdjustments: -(actual.acceptance + actual.penalties + actual.adjustments) / n,
    tax: expectedTax - actual.tax / n,
  };
  const reconstructed = expectedProfit + Object.values(changes).reduce((sum, amount) => sum + amount, 0);
  const realized = actual.finalNetProfit / n;
  return { expected: expectedProfit, changes, reconstructed, realized, unresolved: realized - reconstructed };
}
