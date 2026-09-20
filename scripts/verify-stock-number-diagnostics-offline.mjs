import assert from 'node:assert/strict';
import { flattenCompleteStock } from '../src/lib/wildberries/complete-stock.ts';
import { runWithSyncExecutionContext } from '../src/lib/commercial-continuity/sync-execution-context.ts';
import { runInventoryWorkerTask } from '../src/worker/tasks/inventory-task.ts';
import { createWorkerLogger } from '../src/worker/logger.ts';

globalThis.fetch = () => { throw Error('Network forbidden'); };
const base = {nmId:101,chrtId:202,warehouseId:303,warehouseName:'Synthetic',quantity:4,inWayToClient:2,inWayFromClient:1};
const fields=['nmId','chrtId','warehouseId','quantity','inWayToClient','inWayFromClient'];
const values=[null,undefined,'','12','12.5',12.5,NaN,Infinity,-Infinity,-1,0,7,true,false,' ', '0x10',Number.MAX_SAFE_INTEGER+1,'private-token-value',{token:'private-token-value'},[]];
// Original acceptance predicate, including the existing optional-field fallbacks.
function previouslyAccepted(field, raw) {
  if(field==='warehouseId' && raw==null)return true;
  const value=field.startsWith('inWay') ? raw??0 : raw;
  if(value==null||value===''||typeof value==='boolean')return false;
  const n=Number(value);return Number.isSafeInteger(n)&&n>=(['nmId','chrtId','warehouseId'].includes(field)?1:0);
}
let cases=0;
await runWithSyncExecutionContext({marketplaceAccountId:'1'},async()=>{
  for(const field of fields)for(const value of values){
    let error;try{flattenCompleteStock([{...base,[field]:value}]);}catch(e){error=e;}
    assert.equal(!error,previouslyAccepted(field,value),`${field}: ${String(value)}`);
    if(error){
      const metadata=JSON.parse(error.message.split(': ').slice(1).join(': '));
      assert.equal(metadata.field,field);assert.equal(metadata.rawType,typeof value);
      assert.equal(metadata.itemIndex,0);assert.equal(metadata.warehouseIndex,0);
      assert.equal(metadata.accountId,'1');assert.equal(metadata.sourceItemsFetched,1);
      assert.ok(metadata.reason);assert.ok(!error.message.includes('private-token-value'));
      if(typeof value==='number')assert.equal(metadata.rawValue,Number.isFinite(value)?value:String(value));
    }
    cases++;
  }
  assert.throws(()=>flattenCompleteStock([base,{...base,nmId:102,warehouses:[{warehouseId:304,quantity:1},{warehouseId:305,quantity:1.5}]}]),e=>{
    const m=JSON.parse(e.message.slice(e.message.indexOf(': ')+2));
    assert.equal(m.field,'quantity');assert.equal(m.rawValue,1.5);assert.equal(m.reason,'fractional');
    assert.equal(m.itemIndex,1);assert.equal(m.warehouseIndex,1);assert.equal(m.nmId,102);assert.equal(m.chrtId,202);assert.equal(m.warehouseId,305);return true;
  });
});
const previous=process.env.WB_API_KEY;process.env.WB_API_KEY='1234567890.5';
try{
  let diagnostic;try{flattenCompleteStock([{...base,quantity:process.env.WB_API_KEY}]);}catch(e){diagnostic=e.message;}
  const lines=[];let calls=0;
  const result=await runInventoryWorkerTask({accountIds:['1'],deadlineMs:Date.now()+10000,
    logger:createWorkerLogger('numeric-diagnostic',line=>lines.push(line)),deps:{
      listAccounts:async()=>[{id:'1',accountName:'Synthetic'}],
      runForAccount:async()=>{calls++;return {capture:{status:'failed',message:diagnostic,recordsRead:0,rowsUpserted:0},missingBefore:[],missingAfter:[],gapsFilled:[],purgedRows:0,continuousFromActivation:false};},
    }});
  assert.equal(calls,1);assert.equal(result[0].outcome,'retryable_failure');
  assert.ok(result[0].detail.includes('quantity'));assert.ok(result[0].detail.includes('[redacted]'));
  assert.ok(!JSON.stringify({result,lines}).includes(process.env.WB_API_KEY));
}finally{if(previous===undefined)delete process.env.WB_API_KEY;else process.env.WB_API_KEY=previous;}
console.log(`PASS: ${cases} acceptance-parity cases, six field diagnostics, nested identity, safe omission and worker redaction; no network/persistence`);
