import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSellerWarehouses} from '../src/lib/wildberries/seller-warehouses.ts';
import {persistSellerWarehouses,readSellerWarehouses} from '../src/services/wb-seller-warehouse-service.ts';
const source=[{id:1910512,name:'Мой склад Казань Столбище',officeId:3088703,deliveryType:1,isDeleting:false,isProcessing:false}];
const parsed=parseSellerWarehouses(source);
assert.equal(parsed[0].id,1910512);
assert.equal(parsed[0].officeId,3088703);
assert.notEqual(parsed[0].id,parsed[0].officeId);
for(const bad of [null,[{...source[0],id:'1910512'}],[...source,...source],[{...source[0],officeId:0}],[{...source[0],isDeleting:'false'}]]) {
 assert.throws(()=>parseSellerWarehouses(bad));
}
const saved=new Map();
const admin={from:table=>({upsert:async(rows,options)=>{
 assert.equal(table,'wb_seller_warehouses');
 assert.equal(options.onConflict,'marketplace_account_id,seller_warehouse_id');
 for(const row of rows)saved.set(`${row.marketplace_account_id}:${row.seller_warehouse_id}`,row);
 return {error:null};
}})};
await persistSellerWarehouses('2',parsed,'2026-10-05T12:00:00Z',admin);
await persistSellerWarehouses('2',parsed,'2026-10-05T12:01:00Z',admin);
await persistSellerWarehouses('1',parsed,'2026-10-05T12:01:00Z',admin);
assert.equal(saved.size,2);
assert.equal(saved.get('2:1910512').wb_office_id,3088703);
await assert.rejects(()=>persistSellerWarehouses('unknown',parsed,'2026-10-05',admin));
let scope;
const query={select(){return this},eq(column,value){assert.equal(column,'marketplace_account_id');scope=value;return this},
 order(){return this},async range(){return {data:[...saved.values()].filter(row=>row.marketplace_account_id===scope),error:null}}};
assert.equal((await readSellerWarehouses('2',{from:()=>query})).length,1);
assert.equal((await readSellerWarehouses('2',{from:()=>({...query,range:async()=>({data:null,error:{code:'PGRST205'}})})})).length,0);
await assert.rejects(()=>readSellerWarehouses('2',{from:()=>({...query,range:async()=>({data:null,error:{code:'42501'}})})}));
const sql=readFileSync(new URL('../supabase/migrations/20261005134331_wb_seller_warehouse_catalog.sql',import.meta.url),'utf8');
assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/private\.orion_allowed_marketplace_account_ids/);
assert.match(sql,/REVOKE ALL.*anon/);
assert.match(sql,/PRIMARY KEY \(marketplace_account_id, seller_warehouse_id\)/);
assert.doesNotMatch(sql,/UPDATE public\.wb_(orders|sales|finance)|DELETE FROM/);
console.log('PASS: warehouse/office identities separate, strict full-response validation, account isolation, idempotent catalog upsert, missing-schema compatibility, denied permissions fail closed, RLS/grant static checks.');
