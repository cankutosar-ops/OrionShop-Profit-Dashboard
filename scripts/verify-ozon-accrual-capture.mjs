import assert from 'node:assert/strict';
import { captureOzonAccrualDay } from '../src/lib/ozon/accrual-capture.ts';
const scope={accountId:'17',date:'2026-10-05'};
let published=[];
const publish=async c=>{published.push(c);return c.accruals.length};
const empty=await captureOzonAccrualDay({...scope,readNextPage:async()=>({accruals:[],lastId:'',empty:true}),publish});
assert.equal(empty.status,'NO_ACCRUALS_REPORTED');assert.equal(empty.accountingComplete,false);assert.equal(published.length,1);
const row={accrual_id:'9007199254740993',total_amount:{amount:'-1.2300',currency:'RUB'}};
let page=0;published=[];
const value=await captureOzonAccrualDay({...scope,readNextPage:async()=>++page===1?{accruals:[row,row],lastId:'cursor',empty:false}:{accruals:[],lastId:'',empty:true},publish});
assert.equal(value.rowsPersisted,2);assert.equal(published[0].accruals[0].total_amount.amount,'-1.2300');
for(const readNextPage of [async()=>{throw new Error('safe_http_failure')},async()=>({accruals:[row],lastId:'same',empty:false})]){
 published=[];await assert.rejects(captureOzonAccrualDay({...scope,readNextPage,publish,maxPages:2}));assert.equal(published.length,0);
}
await assert.rejects(captureOzonAccrualDay({...scope,date:'2026-02-30',readNextPage:async()=>{},publish}),/invalid/);
console.log('PASS: empty newcomer finance is valid source evidence; decimal/int64 preserved, duplicate source positions preserved, pagination failure/budget publishes nothing, no accounting completeness inference');
