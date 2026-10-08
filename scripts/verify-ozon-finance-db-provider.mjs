import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('src/services/ozon-finance-service.ts','utf8').replace("import 'server-only';",'')
 .replace("import { buildOzonFinanceModel, type OzonFinanceSnapshot } from '@/lib/ozon/finance-model';",`import {buildOzonFinanceModel} from ${JSON.stringify(new URL('../src/lib/ozon/finance-model.ts',import.meta.url).href)};`)
 .replace("import {calculateOzonNetProfit,type VerifiedOzonProfitInputs} from '@/lib/ozon/profit';",`import {calculateOzonNetProfit} from ${JSON.stringify(new URL('../src/lib/ozon/profit.ts',import.meta.url).href)};`);
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {getOzonFinance,getOzonRealization}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const date='2026-10-01',fee={date,accrued_category:'NON_ITEM',non_item_fee:{type_id:1,accrued:{amount:'-10',currency:'RUB'}},total_amount:{amount:'-10',currency:'RUB'}};
const reads=[];
function client(mode){return {from(table){const filters={};const query={select(){return this},eq(k,v){filters[k]=v;return this},gte(k,v){filters.from=v;return this},lte(k,v){filters.to=v;return this},order(){return this},limit(){return this},in(k,v){filters[k]=v;return this},single(){return this},maybeSingle(){return this},then(resolve){reads.push({table,filters});assert.equal(filters.marketplace_account_id,'17');
 if(mode==='error')return resolve({data:null,error:{message:'private_failure'}});
 if(table==='ozon_accrual_source_current')return resolve({error:null,data:mode==='missing'?[]:[{snapshot_id:'fixture',accrual_date:date}]});
 if(table==='ozon_accrual_source_snapshots')return resolve({error:null,data:[{id:'fixture',marketplace_account_id:'17',accrual_date:date,accruals:mode==='empty'?[]:[fee],row_count:mode==='empty'?0:mode==='bad-count'?2:1,type_dictionary_snapshot_id:'pinned-dictionary'}]});
 if(table==='ozon_financial_reference_snapshots'){assert.equal(filters.id,'pinned-dictionary');assert.equal(filters.kind,'finance-types');assert.equal(filters.period_key,'*');return resolve({error:null,data:{payload:{types:[{id:1,name:'Acquiring',description:'Acquiring'}]}}})}
 return resolve({data:null,error:null});
 }};return query}}}
for(const [mode,status,unavailable] of [['stored','SOURCE_RECONCILED',false],['empty','NO_ACCRUALS_REPORTED',false],['missing','NOT_CAPTURED',false],['error','NOT_CAPTURED',true],['bad-count','NOT_CAPTURED',true]]){
 const result=await getOzonFinance(client(mode),'17',date,date);assert.equal(result.model.status,status);assert.equal(result.unavailable,unavailable);assert.equal(result.model.netProfit,null);
}
assert.ok(!reads.some(read=>read.table==='ozon_financial_reference_current'));
assert.equal((await getOzonRealization(client('missing'),'17','2026-10-02','2026-10-05')).status,'FULL_MONTH_REQUIRED');
await assert.rejects(getOzonFinance(client('stored'),'17','2026-02-30','2026-03-01'),/invalid/);
console.log('PASS: DB-only account/date/pointer/row-count finance provider; pinned historic dictionary; missing/empty/errors distinct; no fabricated net profit and full-month realization guard');
