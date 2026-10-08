import assert from 'node:assert/strict';
import { partitionDashboardFinance, summarizeUnallocatedDashboardFinance } from '../src/lib/dashboard-finance-scope.ts';
import { calculatePotentialProfitNoReturns } from '../src/lib/potential-profit-no-returns.ts';

const row = (id, product, suffix, amount, type='other') => ({ id, product_id: product, marketplace_account_id:'2', operation_date:'2026-09-15', source_key:`rrd:${id}:${suffix}`, wb_source_suffix:suffix, operation_type:type, amount });
const rows = [row('1','respire','logistics',16948.74,'logistics'), row('2',null,'logistics',267642.89,'logistics'), row('3',null,'deduction',270809.11), row('4',null,'storage',30069.50,'storage'), row('5','respire','deduction',0)];
const brand = partitionDashboardFinance(rows, true);
assert.deepEqual(brand.finance.map(r=>r.id), ['1','5']);
assert.deepEqual(brand.unallocatedFinance.map(r=>r.id), ['2','3','4']);
const notice = summarizeUnallocatedDashboardFinance(brand.unallocatedFinance);
assert.equal(notice.logistics,267642.89);
assert.equal(notice.adjustments,270809.11);
assert.equal(notice.storage,30069.50);
assert.equal(partitionDashboardFinance(rows,false).finance,rows,'account-wide data unchanged');
assert.deepEqual(partitionDashboardFinance(rows,false).unallocatedFinance,[]);
assert.deepEqual(partitionDashboardFinance([rows[1]],true).finance,[],'empty brand must not receive all-account costs');
assert.equal(rows.length,5,'input evidence unchanged');

function scenario(gross, net, revenue) {
  const costs = { productCost:83000, logistics:284591.63, storage:30069.50, acceptance:0, penalties:3060, adjustments:270809.11, advertising:0, estimatedTax:12014.68 };
  const actual = revenue - Object.values(costs).reduce((a,b)=>a+b,0);
  return calculatePotentialProfitNoReturns({ grossSales:gross, marketplaceFee:net-revenue, ...costs, currentNetProfit:actual });
}
const result = scenario(307982.37,293939.62,153882.24);
assert.ok(Math.abs(result.returnProfitImpact-14042.75)<1e-8,'only returned sales affect the scenario, not Sales/Finance discrepancy');
assert.equal(scenario(293939.62,293939.62,153882.24).returnProfitImpact,0,'no returns => zero impact despite source gap');
assert.ok(Math.abs(scenario(307982.37,293939.62,170000).returnProfitImpact-14042.75)<1e-8,'same return impact on a different Finance Revenue base');
console.log('PASS brand finance partition: product evidence, unallocated costs, unchanged account totals, empty brand; simulation: exact Respire return amount, zero-return and source-gap regressions');
