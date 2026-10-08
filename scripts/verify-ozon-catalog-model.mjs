import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {buildOzonCatalogModel} from '../src/lib/ozon/catalog-model.ts';
const source={products:[{product_id:1,offer_id:'test',sku:11}],prices:[{product_id:1,price:{price:'100.010000',currency_code:'RUB'}}],stocks:[{product_id:1,stocks:[{type:'fbo',sku:11,present:10,reserved:3,warehouse_ids:[12,13],shipment_type:'general'},{type:'fbs',sku:22,present:0,reserved:0,warehouse_ids:[14]}]}]};
const before=JSON.stringify(source),model=buildOzonCatalogModel(source);
assert.equal(model.rows[0].price,'100.010000');assert.equal(model.rows[0].stocks.length,2);
assert.deepEqual(model.rows[0].stocks[0].warehouseIds,['12','13']);
assert.equal(model.rows[0].stocks[0].present,10);assert.equal(model.rows[0].stocks[1].present,0);
assert.equal(JSON.stringify(source),before);assert.equal(model.warnings.length,0);
const fractional=buildOzonCatalogModel({...source,prices:[{product_id:1,price:{price:2999.99,currency_code:'RUB'}}]});
assert.equal(fractional.rows[0].price,'2999.99');
const unavailable=buildOzonCatalogModel({products:source.products,prices:null,stocks:null});
assert.equal(unavailable.rows[0].price,null);assert.equal(unavailable.rows[0].stocks.length,0);assert.equal(unavailable.warnings.length,2);
const invalid=buildOzonCatalogModel({...source,prices:[{product_id:1,price:{price:'not-money',currency_code:'RUB'}}],stocks:[{product_id:1,stocks:[{type:'fbs',present:-1,reserved:null,warehouse_ids:[-2]}]}]});
assert.equal(invalid.rows[0].price,null);assert.equal(invalid.rows[0].stocks[0].present,null);assert.equal(invalid.rows[0].stocks[0].reserved,null);assert.ok(invalid.warnings.length>=3);
assert.throws(()=>buildOzonCatalogModel({...source,products:[source.products[0],source.products[0]]}),/identity_invalid/);
const captureDir=process.env.OZON_CAPTURE_AUDIT_DIR;
let capturedProducts=null;
if(captureDir){
 const captures=readdirSync(captureDir).filter(name=>name.endsWith('.json')).map(name=>JSON.parse(readFileSync(`${captureDir}/${name}`,'utf8')));
 const evidence={};for(const entity of ['products','prices','stocks'])evidence[entity]=captures.filter(c=>c.entity===entity).sort((a,b)=>b.observedAt.localeCompare(a.observedAt))[0].items;
 const actual=buildOzonCatalogModel(evidence);
 assert.equal(actual.rows.length,14);assert.ok(actual.rows.every(row=>row.price!==null&&row.currency!==null));capturedProducts=actual.rows.length;
}
console.log(JSON.stringify({result:'PASS',checks:['decimal precision preserved','FBO/FBS dimensions','warehouse groups preserved','zero and unavailable distinct','invalid quantities fail closed','source immutable','duplicate identity rejection'],capturedProducts,sourceAudit:captureDir?'PASS':'NOT_REQUESTED'}));
