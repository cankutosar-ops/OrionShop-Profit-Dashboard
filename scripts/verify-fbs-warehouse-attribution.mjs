import assert from 'node:assert/strict';
import {parseWbInt64Json,parseFbsOrderPage,fetchFbsOrderEvidence} from '../src/lib/wildberries/fbs-orders.ts';
import {attributeFbsWarehouses} from '../src/lib/fbs-warehouse-attribution.ts';
import {aggregateWarehouseSales,aggregateWarehouseProductReport} from '../src/lib/warehouse-sales-analytics.ts';
import {persistFbsOrderEvidence,readFbsOrderEvidence} from '../src/services/wb-fbs-evidence-service.ts';
const source={deliveryType:'fbs',rid:'rid-1',id:123,warehouseId:1910512,nmId:22,chrtId:33,createdAt:'2026-09-19T10:00:00Z',address:{fullAddress:'private'},comment:'private'};
const raw='{"next":1791043298619861001,"orders":'+JSON.stringify([source])+'}';
const parsed=parseFbsOrderPage(parseWbInt64Json(raw));
assert.equal(parsed.next,'1791043298619861001');
assert.equal(parsed.orders[0].sellerWarehouseId,1910512);
assert.ok(!JSON.stringify(parsed.orders).includes('private'));
assert.throws(()=>parseFbsOrderPage({next:0,orders:[{...source,nmId:-1}]}));
assert.throws(()=>parseFbsOrderPage({next:0,orders:[{...source,rid:''}]}));
const seen=[];
const captured=await fetchFbsOrderEvidence('fake','2026-09-07','2026-10-04',async url=>{
 seen.push(new URL(url).searchParams.get('next'));
 return new Response(seen.length===1?raw:'{"next":0,"orders":[]}',{status:200});
});
assert.deepEqual(seen,['0','1791043298619861001']);
assert.equal(captured.length,1);
let requests=0;
await assert.rejects(fetchFbsOrderEvidence('fake','2026-09-07','2026-10-04',async()=>{requests++;return new Response('',{status:429})}),/HTTP 429/);
assert.equal(requests,1);
await assert.rejects(fetchFbsOrderEvidence('fake','2026-08-01','2026-10-04'),/at most 30/);
const evidence=[{rid:'rid-1',nm_id:22,seller_warehouse_id:1910512}];
const catalog=[{seller_warehouse_id:1910512,name:'Мой склад Казань Столбище'}];
const orders=[{srid:'rid-1',nm_id:22,warehouse:'Склад WB РФ',quantity:1,price:200}];
const sales=[{srid:'rid-1',nm_id:22,warehouse:'Склад WB РФ',quantity:2,price_with_disc:100,is_return:false,product_id:'p1'},
 {srid:'other',nm_id:22,warehouse:'Склад WB РФ',quantity:1,price_with_disc:100,is_return:false,product_id:'p1'}];
const attributedOrders=attributeFbsWarehouses(orders,evidence,catalog);
const attributedSales=attributeFbsWarehouses(sales,evidence,catalog);
assert.equal(attributedOrders.attributed,1);assert.equal(attributedSales.attributed,1);
assert.equal(attributedSales.rows[0].warehouse,'Мой склад Казань Столбище [FBS #1910512]');
assert.equal(attributedSales.rows[1].warehouse,'Склад WB РФ');
assert.equal(sales[0].warehouse,'Склад WB РФ');
assert.equal(attributeFbsWarehouses([{...sales[0],nm_id:99}],evidence,catalog).attributed,0);
assert.equal(attributeFbsWarehouses(sales,[],catalog).attributed,0);
assert.equal(attributeFbsWarehouses(sales,evidence,[]).attributed,0);
assert.deepEqual(aggregateWarehouseSales({orders,sales}).totals,aggregateWarehouseSales({orders:attributedOrders.rows,sales:attributedSales.rows}).totals);
const report=aggregateWarehouseProductReport(attributedSales.rows,new Map());
assert.equal(report.length,2);assert.equal(report.reduce((n,r)=>n+r.units,0),3);
const storage=[];
const client={from(table){assert.equal(table,'wb_fbs_order_warehouse_evidence');return {
 select(){let account;return {eq(_key,value){account=value;return this},order(){return this},range(){return Promise.resolve({data:storage.filter(r=>r.marketplace_account_id===account),error:null})}}},
 async upsert(records,options){assert.equal(options.ignoreDuplicates,true);for(const r of records){if(!storage.some(s=>s.marketplace_account_id===r.marketplace_account_id&&s.rid===r.rid))storage.push(r)}return {error:null}}
}}};
await persistFbsOrderEvidence('2',parsed.orders,'2026-10-05T12:00:00Z',client);
await persistFbsOrderEvidence('2',parsed.orders,'2026-10-05T12:30:00Z',client);
assert.equal(storage.length,1);
await persistFbsOrderEvidence('1',parsed.orders,'2026-10-05T12:00:00Z',client);
assert.equal(storage.length,2);
await assert.rejects(persistFbsOrderEvidence('2',[{...parsed.orders[0],nmId:99}],'2026-10-05T12:00:00Z',client),/conflict/);
assert.equal(storage.find(r=>r.marketplace_account_id==='2').nm_id,22);
const missing=await readFbsOrderEvidence('2',{from(){return {select(){return this},eq(){return this},order(){return this},range(){return Promise.resolve({data:null,error:{code:'42P01'}})}}}});
assert.equal(missing.available,false);
console.log('PASS: lossless int64 pagination, strict identities, privacy, bounded capture/no retry, RID+nm_id proof, unresolved retention, immutable source, conserved totals and FBS export grouping');
