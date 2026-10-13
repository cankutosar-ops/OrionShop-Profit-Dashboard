import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {captureFbsStocks,parseFbsStocks,summarizeFbsStock,indexFbsStockByProduct} from '../src/lib/wildberries/fbs-stock.ts';
import {readFbsStockRows} from '../src/services/fbs-stock-service.ts';

const warehouse={id:1910512,name:'Kazan FBS',officeId:1,deliveryType:1,isDeleting:false,isProcessing:false};
const variants=[{chrt_id:1,product_id:'10',tech_size:'M'},{chrt_id:1,product_id:'10',tech_size:'M'},
  {chrt_id:2,product_id:'10',tech_size:'L'},{chrt_id:3,product_id:'11',tech_size:'0'}];
const originalFetch=globalThis.fetch;
let requests=[];
try {
  globalThis.fetch=async(url,init)=>{
    assert.match(url,/\/api\/v3\/stocks\/1910512$/); assert.equal(init.method,'POST');
    const ids=JSON.parse(init.body).chrtIds; requests.push(ids);
    assert.equal(new Set(ids).size,ids.length); assert.ok(ids.length<=1000);
    return Response.json({stocks:ids.filter(id=>id!==2).map(chrtId=>({chrtId,amount:chrtId===3?0:5,sku:'barcode'}))});
  };
  const rows=await captureFbsStocks('6','fixture',[warehouse],variants);
  assert.equal(rows.length,3);assert.deepEqual(requests,[[1,2,3]]);
  assert.equal(rows[1].quantity,null,'omitted variant is unknown');assert.equal(rows[2].quantity,0,'reported zero remains zero');
  assert.deepEqual(indexFbsStockByProduct(rows).get('10'),{quantity:5,incomplete:true,observedAt:rows[0].observed_at});
  assert.equal(summarizeFbsStock([rows[1]]).quantity,null,'all-unknown must never display zero');
  assert.equal(summarizeFbsStock([]).quantity,null);
  requests=[];
  await captureFbsStocks('6','fixture',[warehouse],Array.from({length:1001},(_,i)=>({chrt_id:i+1,product_id:'10',tech_size:'M'})));
  assert.deepEqual(requests.map(r=>r.length),[1000,1]);
  for(const bad of [{stocks:[{chrtId:1,amount:-1}]},{stocks:[{chrtId:4,amount:1}]},{stocks:[{chrtId:1,amount:1},{chrtId:1,amount:2}]},{stocks:[{chrtId:1,amount:1.5}]},{}]) {
    assert.throws(()=>parseFbsStocks(bad,[1]));
  }
  await assert.rejects(captureFbsStocks('6','fixture',[warehouse],[...variants,{chrt_id:1,product_id:'20',tech_size:'M'}]),/Ambiguous/);
  globalThis.fetch=async()=>Response.json({message:'unavailable'},{status:429});
  await assert.rejects(captureFbsStocks('6','fixture',[warehouse],variants),/HTTP 429/);
  let reads=[];let missing=false;let failed=false;
  globalThis.fetch=async(input)=>{
    const url=new URL(String(input)); reads.push(url);
    assert.equal(url.searchParams.get('marketplace_account_id'),'eq.6');
    if(missing)return Response.json({code:'PGRST205',message:'missing table'},{status:404});
    if(failed)return Response.json({code:'XX000',message:'unavailable'},{status:500});
    const all=Array.from({length:1003},(_,i)=>({...rows[0],chrt_id:i+1}));
    const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??1000);
    return Response.json(all.slice(offset,offset+limit));
  };
  const client=createClient('https://fixture.invalid','fixture');
  assert.equal((await readFbsStockRows('6',client,'10')).length,1003);
  assert.ok(reads.every(u=>u.searchParams.get('product_id')==='eq.10'));
  missing=true;assert.deepEqual(await readFbsStockRows('6',client),[]);
  missing=false;failed=true;await assert.rejects(readFbsStockRows('6',client),/unavailable/);
  console.log('PASS FBS current stocks: read-only capture, bounded batches, barcode dedupe, explicit zero/unknown, scope, pagination and failures');
} finally {globalThis.fetch=originalFetch;}
