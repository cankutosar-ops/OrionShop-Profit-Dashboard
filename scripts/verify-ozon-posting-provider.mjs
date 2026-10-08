import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const dto=compile(readFileSync('src/lib/ozon/posting-read-client.ts','utf8').replace(/^import .*;\r?\n/gm,''));
const dtoUrl=`data:text/javascript;base64,${Buffer.from(dto).toString('base64')}`;
const source=readFileSync('src/services/ozon-posting-service.ts','utf8').replace("import 'server-only';",'').replace("'@/lib/ozon/posting-read-client'",JSON.stringify(dtoUrl));
const {getOzonPostingWindows}=await import(`data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`);
const posting={posting_number:'fixture-1',order_id:'123',order_number:'order-1',status:'delivering',products:[{sku:'11',offer_id:'test',quantity:1}]};
for(const mode of ['stored','empty','missing','denied','bad-count','bad-identity']){
 const calls=[];
 const client={from(table){assert.ok(['ozon_posting_source_current','ozon_posting_source_snapshots'].includes(table));const filters={};const query={select(){return query},eq(key,value){filters[key]=value;return query},async maybeSingle(){return finish()},async single(){return finish()}};
 const finish=()=>{calls.push({table,...filters});assert.equal(filters.marketplace_account_id,'17');assert.equal(filters.window_from,'2026-09-28T00:00:00Z');assert.equal(filters.window_to,'2026-10-04T23:59:59Z');
  if(mode==='denied')return {error:{message:'private'},data:null};
  if(mode==='missing')return {error:null,data:null};
  if(table==='ozon_posting_source_current')return {error:null,data:{snapshot_id:'fixture-snapshot'}};
  assert.equal(filters.id,'fixture-snapshot');
  const items=mode==='empty'?[]:[mode==='bad-identity'?{...posting,order_id:null}:posting];
  return {error:null,data:{postings:items,row_count:mode==='bad-count'?99:items.length,observed_at:'2026-10-06T00:00:00Z'}};
 };return query}};
 const result=await getOzonPostingWindows(client,'17','2026-09-28T00:00:00Z','2026-10-04T23:59:59Z');
 assert.equal(result.length,2);assert.equal(JSON.stringify(result).includes('private'),false);
 const expected=mode==='stored'||mode==='empty'?'STORED':mode==='missing'?'NOT_CAPTURED':'UNAVAILABLE';
 assert.ok(result.every(row=>row.status===expected));if(mode==='empty')assert.ok(result.every(row=>row.postings.length===0));
}
console.log('PASS: DB-only shipment provider, account/scheme/exact-window/snapshot scope, verified empty window vs unavailable, count/identity fail closed, no private errors');
