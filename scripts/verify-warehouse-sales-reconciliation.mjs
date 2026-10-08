import assert from 'node:assert/strict';
import { aggregateWarehouseSales, aggregateWarehouseProductSales, includeCatalogWarehouses,
  warehousePeriodEndExclusive } from '../src/lib/warehouse-sales-analytics.ts';

const input = {
  orders: [
    { warehouse:'Kazan', product_id:'p1', quantity:1, price:100 },
    { warehouse:'Kazan', product_id:'p1', quantity:1, price:100 },
    { warehouse:'Kazan', product_id:'order-only', quantity:1, price:50 },
    { warehouse:'Kazan', product_id:null, nm_id:42, quantity:1, price:10 },
    { warehouse:null, product_id:null, quantity:1 },
    { warehouse:'Other', product_id:'p1', quantity:1 },
  ],
  sales: [
    { warehouse:' Kazan ', product_id:'p1', quantity:3, price_with_disc:100, is_return:false },
    { warehouse:'Kazan', product_id:'sale-only', quantity:1, price_with_disc:75, is_return:false },
    { warehouse:'Kazan', product_id:null, nm_id:42, quantity:1, price_with_disc:10, is_return:false },
    { warehouse:'Kazan', product_id:'p1', quantity:1, price_with_disc:100, is_return:true },
    { warehouse:'Other', product_id:'p1', quantity:1, price_with_disc:20, is_return:false },
    { warehouse:null, product_id:null, quantity:1, price_with_disc:5, is_return:false },
  ],
};
const {rows,totals} = aggregateWarehouseSales(input);
const products = aggregateWarehouseProductSales(input,'Kazan',new Map([['p1',{sku:'SKU-1',productName:'Product'}]]));
assert.equal(products.find(p=>p.productId==='p1').orders,2);
assert.equal(products.find(p=>p.productId==='p1').units,3);
assert.equal(products.find(p=>p.productId==='order-only').units,0);
assert.equal(products.find(p=>p.productId==='sale-only').orders,0);
assert.equal(products.find(p=>p.productId==='nm:42').orders,1);
const warehouse = rows.find(r=>r.warehouse==='Kazan');
for(const metric of ['orders','units','revenue']) assert.equal(products.reduce((sum,p)=>sum+p[metric],0),warehouse[metric]);
const unknown = aggregateWarehouseProductSales(input,'Unknown Warehouse',new Map());
assert.equal(unknown[0].orders,1);
assert.equal(unknown[0].units,1);
const included = includeCatalogWarehouses(rows,['FBS Kazan','Kazan','Kazan']);
assert.equal(included.filter(r=>r.warehouse==='Kazan').length,1);
assert.equal(included.find(r=>r.warehouse==='FBS Kazan').orders,0);
for(const metric of ['orders','units','revenue']) assert.equal(included.reduce((sum,p)=>sum+p[metric],0),totals[metric]);
assert.equal(warehousePeriodEndExclusive('2026-09-30'),'2026-10-01');
assert.equal(warehousePeriodEndExclusive('2026-12-31'),'2027-01-01');
console.log('PASS: independent demand/buyout counts, order-only and sale-only products, returns excluded, unlinked products retained, warehouse isolation, catalog zero activity, detail/summary reconciliation, inclusive last day.');
