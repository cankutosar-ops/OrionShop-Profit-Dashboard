#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildPricingProfitBridge } from '../src/lib/smart-pricing-realized-bridge.ts';
import { splitExpectedLogistics, weightedHistoricalLogistics } from '../src/lib/smart-pricing-logistics.ts';
import { applySmartPricingCommissionSettings, resolveCostWindowForSettings } from '../src/lib/smart-pricing-settings.ts';
import { resolveEffectiveMarketingPercent, solveRecommendedPrice, verifyRecommendedPrice } from '../src/lib/smart-pricing.ts';
import { resolveRecentAdvertisingPercent } from '../src/lib/smart-pricing-advertising.ts';

const settings = { commissionWindow: 'range', minProductSales: 20, minCategorySales: 50 };
function window(productUnits, returned, logistics, categoryUnits = 100, accountUnits = 500) {
  const row = (unitsSold) => ({ unitsSold, unitsReturned: unitsSold === productUnits ? returned : 0, outboundLogistics: logistics, rebillLogistics: 0 });
  return { productLogistics: row(productUnits), categoryLogistics: row(categoryUnits), accountLogistics: row(accountUnits) };
}
const replay = { historicalReplay: { byWindow: {
  '30': window(2, 0, 100), '60': window(25, 2, 1000), '90': window(40, 4, 2000),
} } };
assert.equal(resolveCostWindowForSettings(replay, settings), '60');
replay.historicalReplay.byWindow['30'].productLogistics.unitsSold = 25;
assert.equal(resolveCostWindowForSettings(replay, settings), '30');
replay.historicalReplay.byWindow['30'].productLogistics.outboundLogistics = 0;
assert.equal(resolveCostWindowForSettings(replay, settings), '60'); // uncharged recent sales are not sufficient evidence
replay.historicalReplay.byWindow['30'].productLogistics.unitsSold = 2;
replay.historicalReplay.byWindow['60'].productLogistics.unitsSold = 2;
replay.historicalReplay.byWindow['90'].productLogistics.unitsSold = 2;
assert.equal(resolveCostWindowForSettings(replay, settings), '30'); // category fallback
assert.equal(weightedHistoricalLogistics({ outboundLogistics: 15979.10, rebillLogistics: 0, unitsSold: 39, unitsReturned: 7 }).toFixed(2), '499.35');
const split = splitExpectedLogistics({ outboundLogistics: 15979.10, rebillLogistics: 0, unitsSold: 39, unitsReturned: 7 });
assert.ok(Math.abs(split.base + split.returnBurden - 499.346875) < 0.001);
assert.equal(resolveEffectiveMarketingPercent(5, 5.93), 5.93);
assert.equal(resolveEffectiveMarketingPercent(7, 5.93), 7);
assert.equal(resolveRecentAdvertisingPercent({ completedUnits: 7, netSales: 20000, spend: 2000 }), null);
assert.equal(resolveRecentAdvertisingPercent({ completedUnits: 39, netSales: 166858.77, spend: 9893.31 }).toFixed(2), '5.93');

const fixtures = [
  { article: 'i8-80444', price: 5168.149487179487, cost: 1660.77, fee: 43.65514021228852, logistics: 15979.10, gross: 39, returns: 7, ads: 5.929151940889893,
    actual: { netUnits: 24, saleUnits: 27, netSales: 127813.74, salesForPay: 71955.93, financeForPay: 69474.66, logistics: 15047.44, storage: 0, acceptance: 550, penalties: 0, adjustments: 0, advertising: 9893.31, productCost: 1660.77 * 24, tax: 77183 * 0.06 } },
  { article: 'i8-80545', price: 4900.66925, cost: 1410.77, fee: 43.424708831946324, logistics: 20909.15, gross: 40, returns: 7, ads: 5,
    actual: { netUnits: 28, saleUnits: 35, netSales: 137385.74, salesForPay: 77744.85, financeForPay: 74249.31, logistics: 19947.44, storage: 0, acceptance: 680, penalties: 0, adjustments: 0, advertising: 5873.60, productCost: 1410.77 * 28, tax: 87056 * 0.06 } },
];
for (const item of fixtures) {
  const actual = { ...item.actual };
  actual.finalNetProfit = actual.financeForPay - actual.logistics - actual.storage - actual.acceptance - actual.penalties - actual.adjustments - actual.advertising - actual.productCost - actual.tax;
  const cost = splitExpectedLogistics({ outboundLogistics: item.logistics, rebillLogistics: 0, unitsSold: item.gross, unitsReturned: item.returns });
  if (item.gross >= 20) {
    const logisticsTotals = { outboundLogistics: item.logistics, rebillLogistics: 0, unitsSold: item.gross, unitsReturned: item.returns };
    const feeTotals = { marketplaceFees: item.price * 100 * item.fee / 100, revenue: item.price * 100, salesForPay: item.price * 100 * (1 - item.fee / 100), unitsSold: item.gross };
    const storageTotals = { storage: 0, unitsSold: item.gross, unitsReturned: item.returns };
    const bucket = { productLogistics: logisticsTotals, categoryLogistics: logisticsTotals, accountLogistics: logisticsTotals, productMarketplaceFees: feeTotals, categoryMarketplaceFees: feeTotals, accountMarketplaceFees: feeTotals, productStorage: storageTotals, categoryStorage: storageTotals, accountStorage: storageTotals };
    const input = { historicalReplay: { marketplace: 'wildberries', byWindow: { '30': bucket, '60': bucket, '90': bucket } } };
    const resolved = applySmartPricingCommissionSettings(input, settings);
    assert.equal(resolved.resolutionSource, 'PRODUCT_HISTORY');
    assert.equal(resolved.costWindowDays, 30);
    assert.ok(Math.abs(resolved.historicalLogistics - item.logistics / (item.gross - item.returns)) < 0.01);
    assert.ok(Math.abs(resolved.marketplaceFeesPercent - item.fee) < 0.01);
    assert.ok(Math.abs(resolved.expectedReturnBurden - cost.returnBurden) < 0.01);
  }
  const bridge = buildPricingProfitBridge({ salePrice: item.price, marketplaceFeesPercent: item.fee, baseLogistics: cost.base, returnBurden: cost.returnBurden, storage: 0, productCost: item.cost, advertisingPercent: item.ads, taxPercent: 6 }, actual);
  assert.ok(bridge, `${item.article}: bridge available`);
  assert.ok(Math.abs(bridge.unresolved) < 0.01, `${item.article}: bridge reconciles`);
  assert.ok(Math.abs(bridge.expected - bridge.realized) < 400, `${item.article}: new model materially closer`);
  const solver = { purchaseCost: item.cost, historicalLogistics: cost.base + cost.returnBurden, effectiveLogistics: cost.base + cost.returnBurden, storagePerUnit: 0, marketplaceFeesPercent: item.fee, commissionPercent: item.fee };
  for (const target of [15, 20, 27]) {
    const price = solveRecommendedPrice(solver, target, item.ads, 6);
    assert.ok(price && price > 0);
    assert.ok(Math.abs(verifyRecommendedPrice(solver, target, item.ads, price, 6).marginPercent - target) < 1e-9);
  }
  console.log(`${item.article}: expected ${bridge.expected.toFixed(2)}, realized ${bridge.realized.toFixed(2)}, unresolved ${bridge.unresolved.toFixed(4)} RUB/unit`);
}
console.log('Smart Pricing V3 realized-cost verifier passed');
