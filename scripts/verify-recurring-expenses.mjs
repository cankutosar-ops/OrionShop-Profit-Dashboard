import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeRecurringExpenses as sum, validateRecurringExpense } from '../src/lib/recurring-expenses.ts';
const scope={companyId:'3',accountId:'6',from:'2026-10-01',to:'2026-10-31'};
const rules=[['a','ACCOUNTING',20000],['b','PAYROLL',40000],['c','OTHER',5000]].map(([id,category,monthly_amount])=>({id,category,monthly_amount,company_id:'3',marketplace_account_id:'6',description:category,start_date:'2026-10-01',end_date:null}));
assert.equal(sum(rules,scope).totalKopeks,6500000);
assert.equal(sum(rules,{...scope,from:'2026-11-01',to:'2026-11-30'}).totalKopeks,6500000);
assert.equal(sum(rules,{...scope,to:'2026-12-31'}).totalKopeks,19500000);
assert.equal(sum(rules,{...scope,from:'2026-09-01',to:'2026-09-30'}).totalKopeks,0);
const partial=sum(rules,{...scope,from:'2026-10-13',to:'2026-10-19'});
assert.equal(partial.lines.length,3);
assert.ok(partial.totalKopeks>0&&partial.totalKopeks<6500000);
assert.equal(sum(rules,{...scope,to:'2026-10-15'}).totalKopeks+sum(rules,{...scope,from:'2026-10-16'}).totalKopeks,6500000);
for(const [from,to] of [['2028-02-01','2028-02-29'],['2027-02-01','2027-02-28']]) {
 const leap=rules.map(r=>({...r,start_date:from}));
 assert.equal(sum(leap,{...scope,from,to}).totalKopeks,6500000);
}
const ended=rules.map(r=>({...r,end_date:'2026-10-15'}));
assert.equal(sum(ended,{...scope,from:'2026-10-16'}).totalKopeks,0);
assert.throws(()=>sum([...rules,rules[0]],scope),/Duplicate/);
assert.throws(()=>sum([{...rules[0],company_id:'2'}],scope),/Cross-tenant/);
assert.throws(()=>sum([{...rules[0],marketplace_account_id:'2'}],scope),/Cross-tenant/);
for (const range of [{from:'2026-02-30'}, {from:'2026-11-01'}, {to:'2040-10-31'}]) assert.throws(()=>sum(rules,{...scope,...range}),/Invalid date/);
for(const change of [{monthlyAmount:-1},{monthlyAmount:1.001},{startDate:'2026-10-13'},{category:'INVALID'}])
 assert.throws(()=>validateRecurringExpense({category:'ACCOUNTING',description:'Accounting',monthlyAmount:20000,startDate:'2026-10-01',...change}));
const endpoint=readFileSync('src/app/api/expenses/recurring/route.ts','utf8');
assert.match(endpoint,/authorize\(request, \{ companyId, marketplaceAccountId: accountId, requireMarketplaceAccount: true \}/);
assert.match(endpoint,/Cache-Control.*private, no-store/);
const panel=readFileSync('src/components/dashboard/recurring-expense-panel.tsx','utf8');
assert.match(panel,/AbortController/); assert.match(panel,/result\?\.key === key/);
assert.match(panel,/profitReady && !brandId/);
assert.match(panel,/Math.round\(netProfit \* 100\) - data.totalKopeks/);
assert.match(panel,/response.ok/);
const service=readFileSync('src/services/company-recurring-expense-service.ts','utf8');
const reader=service.slice(0,service.indexOf('export async function createRecurringExpense'));
assert.doesNotMatch(reader,/\.insert\(|\.upsert\(|\.update\(/,'Reads must not create duplicate monthly facts');
assert.match(reader,/createServerClient/); assert.match(reader,/\.eq\("marketplace_account_id", scope.accountId\)/);
console.log('PASS recurring expenses: exact 65,000 RUB/month, automatic future periods, day allocation and penny conservation, leap years, effective dates, duplicate rejection, company/account isolation, no read writes, cancellable UI, brand exclusion and profit-after-fixed-cost formula.');
