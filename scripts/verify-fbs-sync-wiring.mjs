import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {syncFbsCurrentStock} from '../src/services/fbs-stock-sync-service.ts';
import {runWithSyncExecutionContext} from '../src/lib/commercial-continuity/sync-execution-context.ts';
const original=globalThis.fetch;
const warehouse={id:1910512,name:'Kazan FBS',officeId:1,deliveryType:1,isDeleting:false,isProcessing:false};
const now=Date.parse('2026-10-26T09:15:00Z');
const rows=[1,2].map(chrt_id=>({marketplace_account_id:'1',seller_warehouse_id:warehouse.id,chrt_id,product_id:'17',warehouse_name:warehouse.name,tech_size:'M',sku:null,quantity:chrt_id===1?5:null,observed_at:new Date(now).toISOString()}));
let fresh=false,missing=false,persistFailed=false,captureFailed=false,calls=[],captures=0,warehouseSaves=0;
globalThis.fetch=async(input,init)=>{
 const url=new URL(String(input));calls.push(url.pathname);
 if(url.pathname==='/rest/v1/wb_fbs_current_stocks'){
  assert.equal(url.searchParams.get('marketplace_account_id'),'eq.1');
  if(missing)return Response.json({code:'PGRST205',message:'missing'},{status:404});
  return Response.json(fresh?[{observed_at:new Date(now-1000).toISOString()}]:[]);
 }
 if(url.pathname.endsWith('product_variants')){
  assert.equal(url.searchParams.get('marketplace_account_id'),'eq.1');
  return Response.json(rows.map(row=>({product_id:row.product_id,chrt_id:row.chrt_id,tech_size:row.tech_size})));
 }
 assert.ok(url.pathname.endsWith('replace_wb_fbs_current_stocks'));
 const body=JSON.parse(init.body);assert.equal(body.p_account_id,'1');assert.deepEqual(body.p_rows,rows);
 return persistFailed?Response.json({code:'P0001',message:'atomic failure'},{status:400}):Response.json(rows.length);
};
const deps={client:createClient('https://fixture.invalid','fixture'),now:()=>now,
 loadAccount:async()=>({apiKey:'fixture',marketplace:'wildberries'}),
 warehouses:async()=>[warehouse],capture:async(id,token,warehouses,variants)=>{
  captures++;assert.equal(id,'1');assert.equal(token,'fixture');assert.equal(variants.length,2);
  if(captureFailed)throw Error('WB FBS inventory HTTP 429');return rows;
 },saveWarehouses:async()=>{warehouseSaves++;}};
try{
 assert.deepEqual(await syncFbsCurrentStock('1',{deps}),{status:'captured',rows:2});
 assert.equal(captures,1);assert.equal(warehouseSaves,1);
 calls=[];fresh=true;
 assert.equal((await syncFbsCurrentStock('1',{deps})).status,'fresh');
 assert.deepEqual(calls,['/rest/v1/wb_fbs_current_stocks']);assert.equal(captures,1);
 assert.equal((await syncFbsCurrentStock('1',{deps,force:true})).status,'captured');assert.equal(captures,2);
 missing=true;calls=[];
 await assert.rejects(syncFbsCurrentStock('1',{deps}),/schema missing/);assert.equal(captures,2);
 missing=false;fresh=false;captureFailed=true;calls=[];
 await assert.rejects(syncFbsCurrentStock('1',{deps}),/HTTP 429/);
 assert.ok(!calls.some(path=>path.endsWith('replace_wb_fbs_current_stocks')),'Failure must never replace saved facts');
 captureFailed=false;persistFailed=true;
 await assert.rejects(syncFbsCurrentStock('1',{deps}),/Atomic FBS/);
 calls=[];const controller=new AbortController();controller.abort();
 await assert.rejects(runWithSyncExecutionContext({abortSignal:controller.signal},()=>syncFbsCurrentStock('1',{deps})),/abort/i);
 assert.equal(calls.length,0);
 const stock=readFileSync('src/lib/wildberries/sync-service.ts','utf8').split('async syncStock()')[1].split('private async')[0];
 assert.match(stock,/syncFbsCurrentStock\(this.marketplaceAccountId, \{ force: true \}\)/);
 assert.match(readFileSync('src/services/inventory-daily-snapshot-service.ts','utf8'),/await syncFbsCurrentStock\(accountId, \{ apiKey: account.apiKey \}\)/);
 assert.match(readFileSync('src/lib/schema-compatibility.ts','utf8'),/table: "wb_fbs_current_stocks", column: "quantity"/);
 console.log('PASS FBS sync wiring: daily/manual paths, forced refresh, backup dedupe, account isolation, missing schema, no retry, failed capture preserves facts, and cancellation. No production writes.');
}finally{globalThis.fetch=original;}
