import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { syncCanonicalCurrentStock } from '../src/lib/marketplace-adapters/wildberries/current-stock-sync.ts';
import { runCurrentStockWorkerTask } from '../src/worker/tasks/current-stock-task.ts';
import { flattenCompleteStock } from '../src/lib/wildberries/complete-stock.ts';
import { WbApiClient } from '../src/lib/wildberries/api-client.ts';
import { runWithSyncExecutionContext } from '../src/lib/commercial-continuity/sync-execution-context.ts';
import { DEFAULT_SYNC_WORKER_TASKS } from '../src/worker/types.ts';
globalThis.fetch=()=>{throw new Error('Network forbidden in offline verification');};
const source=[{nmId:100,chrtId:201,warehouseId:7,warehouseName:'North',quantity:5},
  {nmId:100,chrtId:202,warehouseId:7,warehouseName:'North',quantity:3},
  {nmId:100,chrtId:201,warehouseId:8,warehouseName:'South',quantity:4}];
let writes=0,fail=false;const stored=new Map();
const client={from(table){assert.equal(table,'product_variants');let account;
  return {select(){return this;},eq(k,v){account=v;return this;},not(){return this;},order(){return this;},
    async range(){return {error:null,data:[{nm_id:100,chrt_id:201,barcode:`BC-${account}`,tech_size:'M'}]};}};},
  async rpc(name,args){assert.equal(name,'replace_wb_current_stocks_verified');if(fail)return {error:{message:'forced DB error'}};
    writes++;stored.set(args.p_account_id,args.p_rows);return {data:args.p_rows.length,error:null};}};
const sync=(items,account='1')=>syncCanonicalCurrentStock(account,Date.now()+10000,{client,fetchComplete:async()=>items});
assert.equal(await sync(source),3);await sync(source,'2');
assert.equal(stored.get('1')[0].barcode,'BC-1');assert.equal(stored.get('2')[0].barcode,'BC-2');
const stable=JSON.stringify(stored.get('2'));
for(const bad of [[],null,[{}],[{...source[0],quantity:null}], [source[0],source[0]],
  [{...source[0],warehouses:[]}],[{...source[0],quantity:-1}]]) {
  const n=writes;await assert.rejects(()=>sync(bad));assert.equal(writes,n);assert.equal(JSON.stringify(stored.get('2')),stable);
}
const old=JSON.stringify(stored.get('1'));fail=true;await assert.rejects(()=>sync(source),/forced DB error/);
assert.equal(JSON.stringify(stored.get('1')),old);fail=false;
await assert.rejects(()=>syncCanonicalCurrentStock('1',Date.now()+1000,{client,fetchComplete:async()=>{throw Error('API unavailable');}}));
assert.equal(JSON.stringify(stored.get('1')),old);
const api=new WbApiClient('offline');api.request=async()=>({data:{}});
await assert.rejects(()=>api.fetchWbWarehousesStock(),/Malformed/);
api.request=async()=>({data:{items:source}});assert.deepEqual(await api.fetchWbWarehousesStock(),source);
// A full page followed by an interrupted pagination wait must never publish.
api.request=async()=>({data:{items:Array(100000).fill(source[0])}});
const n=writes;
await assert.rejects(()=>runWithSyncExecutionContext({abortSignal:AbortSignal.timeout(30)},
  ()=>syncCanonicalCurrentStock('1',Date.now()+30,{client,fetchComplete:()=>api.fetchWbWarehousesStock()})));
assert.equal(writes,n);
assert.equal(flattenCompleteStock([{nmId:100,chrtId:201,warehouses:[{warehouseId:7,quantity:2}]}]).length,1);
const logger={error(){},info(){},log(){},warn(){}};
await assert.rejects(()=>runCurrentStockWorkerTask({logger,deadlineMs:Date.now()+1000}),/exactly one/);
const deps={listAccounts:async()=>[{id:'1',accountName:'synthetic'}],sync:async()=>3};
let result=await runCurrentStockWorkerTask({accountIds:['1'],deadlineMs:Date.now()+1000,logger,deps});
assert.equal(result[0].outcome,'success');assert.equal(result[0].entities[0].rowsPersisted,3);
deps.sync=async()=>{throw Error('offline failure');};
result=await runCurrentStockWorkerTask({accountIds:['1'],deadlineMs:Date.now()+1000,logger,deps});
assert.equal(result[0].outcome,'retryable_failure');assert.ok(!DEFAULT_SYNC_WORKER_TASKS.includes('current-stock'));
const snapshot=readFileSync('src/services/inventory-daily-snapshot-service.ts','utf8');
const replace=snapshot.slice(snapshot.indexOf('async function replaceSnapshotDay'),snapshot.indexOf('async function upsertSnapshotRows'));
assert.match(replace,/replace_inventory_snapshot_day/);assert.doesNotMatch(replace,/\.delete\(/);
assert.match(snapshot,/if \(skipped \|\| !rows.length\)/);
console.log('PASS: complete source validation, malformed/empty/API/DB/partial retention, account catalog isolation, independent worker outcomes, no network');
