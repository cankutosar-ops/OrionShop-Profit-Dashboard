export type OzonStockEvidence = { scheme: string; sku: string | null; present: number | null; reserved: number | null; warehouseIds: string[]; shipmentType: string | null };
export type OzonCatalogRow = { productId: number; offerId: string; sku: string | null; price: string | null; currency: string | null; stocks: OzonStockEvidence[] };
export type OzonCatalogModel = { rows: OzonCatalogRow[]; warnings: string[] };
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const identity=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?String(value):null;
const quantity=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
const decimal=(value:unknown)=>typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value)?value:
  typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER?String(value):null;

/** Read projection only; source amounts/warehouse groups remain intact, no accounting interpretation. */
export function buildOzonCatalogModel(input:{products:Record<string,unknown>[]|null;prices:Record<string,unknown>[]|null;stocks:Record<string,unknown>[]|null}):OzonCatalogModel {
  const warnings=new Set<string>();
  if(input.products===null)warnings.add('Product catalog is unavailable.');
  if(input.prices===null)warnings.add('Current prices are unavailable.');
  if(input.stocks===null)warnings.add('Current stock is unavailable.');
  const index=(items:Record<string,unknown>[]|null)=>{
    const map=new Map<number,Record<string,unknown>>();
    for(const item of items??[]){if(!identity(item.product_id)||map.has(item.product_id as number))throw new Error('ozon_catalog_identity_invalid');map.set(item.product_id as number,item)}
    return map;
  };
  const products=index(input.products),prices=index(input.prices),stocks=index(input.stocks);
  const ids=[...new Set([...products.keys(),...prices.keys(),...stocks.keys()])];
  const rows=ids.map(productId=>{
    const product=products.get(productId),priceRecord=prices.get(productId),stockRecord=stocks.get(productId);
    if(!product)warnings.add('Some price/stock products are absent from the stored catalog.');
    const price=record(priceRecord?.price)?priceRecord.price:null;
    const priceText=decimal(price?.price),currency=typeof price?.currency_code==='string'?price.currency_code:null;
    if(priceRecord&&(!priceText||!currency))warnings.add('Some products have unverified price evidence.');
    const stockRows:OzonStockEvidence[]=[];
    if(stockRecord&& !Array.isArray(stockRecord.stocks))warnings.add('Some products have invalid stock evidence.');
    for(const stock of Array.isArray(stockRecord?.stocks)?stockRecord.stocks:[]){
      if(!record(stock)){warnings.add('Some products have invalid stock evidence.');continue;}
      const warehouseIds=Array.isArray(stock.warehouse_ids)?stock.warehouse_ids.map(identity):[];
      const validWarehouseIds=warehouseIds.filter((id):id is string=>id!==null);
      if(validWarehouseIds.length!==warehouseIds.length)warnings.add('Some stock warehouse identities are unverified.');
      const present=quantity(stock.present),reserved=quantity(stock.reserved);
      if(present===null||reserved===null)warnings.add('Some stock quantities are unverified.');
      stockRows.push({scheme:typeof stock.type==='string'?stock.type:'Unknown',sku:identity(stock.sku),present,reserved,
        warehouseIds:validWarehouseIds,shipmentType:typeof stock.shipment_type==='string'?stock.shipment_type:null});
    }
    const offer=product?.offer_id??priceRecord?.offer_id??stockRecord?.offer_id;
    return {productId,offerId:typeof offer==='string'?offer:String(productId),sku:identity(product?.sku),
      price:priceText,currency,stocks:stockRows};
  }).sort((a,b)=>a.offerId.localeCompare(b.offerId));
  return {rows,warnings:[...warnings]};
}
