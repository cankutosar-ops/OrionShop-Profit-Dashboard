import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SmartPricingCostEvidence } from '../src/components/analytics/smart-pricing-cost-evidence.tsx';
import { applySmartPricingCommissionSettings, resolveCostWindowForSettings } from '../src/lib/smart-pricing-settings.ts';
import { buildSmartPricingRow } from '../src/lib/smart-pricing.ts';
import { computeSmartPricingSimulation } from '../src/lib/smart-pricing-simulator.ts';
import { sumProductHistoricalLogisticsMetrics, buildCategoryLogisticsTotals, buildAccountLogisticsTotals, hasLeadingLogisticsGap } from '../src/lib/smart-pricing-logistics.ts';
globalThis.React = React;

const settings = { commissionWindow: 'range', minProductSales: 20, minCategorySales: 50 };
let uiRow;
function bucket(sold, returned, logistics, netSales, forPay, from) {
  const l = { unitsSold: sold, unitsReturned: returned, outboundLogistics: logistics, rebillLogistics: 0,
    firstSaleDate: from, firstLogisticsDate: from, lastLogisticsDate: '2026-11-08' };
  const fee = { unitsSold: sold, revenue: netSales, salesForPay: forPay, marketplaceFees: netSales-forPay };
  const st = { storage: 0, unitsSold: sold, unitsReturned: returned };
  return { productLogistics: l, categoryLogistics: {...l, unitsSold: 500}, accountLogistics: {...l, unitsSold: 1000},
    productMarketplaceFees: fee, categoryMarketplaceFees: fee, accountMarketplaceFees: fee,
    productStorage: st, categoryStorage: st, accountStorage: st };
}
// Account 2 audit snapshots. No live DB access; deterministic approval backtest.
const examples = [
  { model: 'i8-80444', cost:1660.77, recent: [21,3,16689.95,100222.47,56652.79], long:[76,12,45873.91,357517.95,202032.73], expected:6583 },
  { model: 'i8-80545', cost:1410.77, recent: [20,2,13312.89,99762.22,56422.84], long:[88,15,46107.6,378724.07,214435.49], expected:5638 },
];
for(const f of examples) {
  const input = { supplierArticle:f.model, purchaseCost:f.cost, costAsOfDate:'2026-11-08', currentAvgPrice:5500,
    hasSalesHistory:true, returnRatePercent:0, excludedLogisticsPercent:0, returnLogisticsPercent:0,
    historicalReplay:{ marketplace:'wildberries', byWindow:{
      '30':bucket(...f.recent,'2026-10-10'), '60':bucket(...f.long,'2026-09-10'), '90':bucket(...f.long,'2026-08-11') } } };
  const result = applySmartPricingCommissionSettings(input,settings);
  uiRow = result;
  assert.equal(result.costWindowDays,60);
  assert.equal(result.resolutionSource,'PRODUCT_HISTORY');
  assert.equal(result.costWindowFrom,'2026-09-10');
  assert.equal(result.historicalCompletedUnits,f.long[0]);
  assert.equal(result.costSampleReturnedUnits,f.long[1]);
  assert.ok(Math.abs(result.expectedBaseLogistics + result.expectedReturnBurden-result.historicalLogistics)<1e-8);
  const computed = buildSmartPricingRow(result,15,2,6);
  assert.equal(Math.round(computed.targetPrice),f.expected);
  const html = renderToStaticMarkup(React.createElement(SmartPricingCostEvidence,{row:result}));
  for(const text of ['SKU 60d','2026-09-10','2026-11-08',`${f.long[0]} sales`,`${f.long[1]} returns`,'30d logistics +','not a matched order cohort']) assert.ok(html.includes(text),text);
  assert.ok(html.includes('<details') && html.includes('<summary'));
  const win = input.historicalReplay.byWindow;
  win['30'].productLogistics.unitsSold=49;
  assert.equal(resolveCostWindowForSettings(input,settings),'60');
  win['30'].productLogistics.unitsSold=50;
  assert.equal(resolveCostWindowForSettings(input,settings),'30');
  assert.equal(applySmartPricingCommissionSettings(input,settings).resolutionSource,'PRODUCT_HISTORY');
  win['30'].productLogistics.unitsSold=19;
  win['60'].productLogistics.unitsSold=19;
  win['90'].productLogistics.firstLogisticsDate='2026-08-29';
  assert.equal(resolveCostWindowForSettings(input,settings),'30'); // unsafe SKU90 cannot beat valid category
  assert.equal(applySmartPricingCommissionSettings(input,settings).resolutionSource,'CATEGORY_HISTORY');
  assert.equal(resolveCostWindowForSettings(input,{...settings,commissionWindow:'60'}),'60');
  for(const w of Object.values(win)) for(const key of ['productLogistics','categoryLogistics','accountLogistics']) {
    w[key].firstSaleDate='2026-08-11'; w[key].firstLogisticsDate='2026-08-29';
  }
  const unsafe = buildSmartPricingRow(applySmartPricingCommissionSettings(input,settings),15,2,6);
  assert.ok(unsafe.costEvidenceWarning);
  assert.equal(unsafe.targetPrice,null);
  assert.notEqual(unsafe.status,'missing-cost');
  assert.equal(computeSmartPricingSimulation(unsafe,6000,2,6),null);
  console.log(`${f.model}: SKU60; price ${f.expected}; sample, warning and fallback tests passed`);
}
const sales=[{quantity:1,is_return:false,sale_date:'2026-08-11'}, {quantity:1,is_return:true,sale_date:'2026-08-25'}];
const finance=[{finance_category:'LOGISTICS',amount:100,operation_date:'2026-08-29'}, {finance_category:'LOGISTICS',amount:0,operation_date:'2026-08-11'}];
const totals=sumProductHistoricalLogisticsMetrics(sales,finance);
assert.equal(totals.firstLogisticsDate,'2026-08-29');
assert.equal(totals.unitsReturned,1);
assert.ok(hasLeadingLogisticsGap(totals));
assert.equal(hasLeadingLogisticsGap({...totals,firstLogisticsDate:'2026-08-18'}),false);
const products=[{id:'1',category_id:'15'}], sm=new Map([['1',sales]]), fm=new Map([['1',finance]]);
assert.ok(hasLeadingLogisticsGap(buildCategoryLogisticsTotals(products,sm,fm).get('15')));
assert.ok(hasLeadingLogisticsGap(buildAccountLogisticsTotals(products,sm,fm)));
console.log('Smart Pricing history evidence checks passed');

if (process.argv.includes('--browser')) {
  const { chromium } = await import('@playwright/test');
  const { readFileSync, readdirSync } = await import('node:fs');
  const css = readdirSync('.next/static/css').filter(f => f.endsWith('.css'))
    .map(f => readFileSync(`.next/static/css/${f}`, 'utf8')).join('\n');
  const browser = await chromium.launch({headless:true});
  try {
    for (const width of [390,1440]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      const html = renderToStaticMarkup(React.createElement(SmartPricingCostEvidence,{row:uiRow}));
      await page.setContent(`<style>${css}</style><main class="p-4"><div class="overflow-x-auto"><table><tbody><tr><td>${html}</td></tr></tbody></table></div></main>`);
      await page.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('details').evaluate(el=>el.open),true);
      assert.equal(await page.getByText('Cost period:',{exact:false}).isVisible(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('summary').click();
      assert.equal(await page.locator('details').evaluate(el=>el.open),false);
      await page.close();
      console.log(`PASS cost evidence UI at ${width}px: keyboard, click, dates, no page overflow`);
    }
  } finally { await browser.close(); }
}
