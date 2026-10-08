import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('src/services/ozon-finance-source-service.ts','utf8').replace("import 'server-only';",'');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {getOzonFinanceSourceStatus}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function client(mode){return {from(table){const filters={};return {select(){return this},eq(k,v){filters[k]=v;return this},gte(k,v){filters.from=v;return this},lte(k,v){filters.to=v;return this},order(){return this},in(k,v){filters.ids=v;return this},limit(){return this},then(resolve){assert.equal(filters.marketplace_account_id,'17');
 if(mode==='error')return resolve({error:{message:'private error'},data:null});
 if(table==='ozon_accrual_source_current'){assert.equal(filters.from,'2026-10-01');assert.equal(filters.to,'2026-10-05');return resolve({error:null,data:mode==='missing'?[]:[{accrual_date:'2026-10-05',snapshot_id:'fixture'}]})}
 assert.deepEqual(filters.ids,['fixture']);return resolve({error:null,data:[{id:'fixture',accrual_date:'2026-10-05',observed_at:'2026-10-06T00:00:00Z',accounting_complete:false,row_count:mode==='rows'?3:mode==='invalid'?-1:0}]});
 }}}}}
for(const [mode,status] of [['empty','NO_ACCRUALS_REPORTED'],['rows','SOURCE_ROWS_STORED'],['missing','NOT_CAPTURED'],['error','UNAVAILABLE'],['invalid','UNAVAILABLE']]){
 const result=await getOzonFinanceSourceStatus(client(mode),'17','2026-10-01','2026-10-05');assert.equal(result.status,status);assert.ok(!JSON.stringify(result).includes('private error'));
 if(['missing','error','invalid'].includes(mode))assert.equal(result.rowsStored,null);
}
console.log('PASS: DB-only Ozon finance source status, empty observations distinct from missing/errors, bounded account/date/snapshot filters, no inferred financial zero');
