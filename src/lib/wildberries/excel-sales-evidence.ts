import type { WbSale } from '@/types/database';
export type ExcelSalesSource = { reportId:string; sellerId:string; fileSha256:string; fields:Record<string,string> };
export type ExcelSalesEvidence = {
 marketplace_account_id:string; report_id:number; source_row_number:number; file_sha256:string;
 product_id:string; nm_id:number; srid:string; event_type:'SALE'|'RETURN'; sale_date:string;
 quantity:1; price_with_disc:number; customer_paid:number; finance_payable_raw:number;
 barcode:string|null; tech_size:string|null; warehouse:string|null;
};
function money(raw:string):number {
 const text=String(raw??'').replace(/[\s\u00a0]/g,'').replace(',','.');
 if(!/^-?\d+(\.\d+)?$/.test(text))throw Error('EXCEL_SALES_INVALID_MONEY');
 const n=Number(text);if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER/100)throw Error('EXCEL_SALES_UNSAFE_MONEY');return n;
}
function day(raw:string):string {
 const parsed=new Date(raw+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==raw)throw Error('EXCEL_SALES_INVALID_DATE');return raw;
}
/** Only genuine financial-report SALE/RETURN evidence; no native saleID/forPay is invented. */
export function buildHistoricalExcelSales(rows:readonly ExcelSalesSource[],products:readonly {id:string;nm_id:number}[]):ExcelSalesEvidence[] {
 const byNm=new Map(products.map(p=>[String(p.nm_id),p.id]));const identities=new Set<string>();
 return rows.map(row=>{
  const f=row.fields;const op=f['Обоснование для оплаты'];
  if(row.sellerId!=='250027002'||!/^\d+$/.test(row.reportId)||!/^\d+$/.test(f['№'])||!/^[a-f0-9]{64}$/.test(row.fileSha256))throw Error('EXCEL_SALES_SOURCE_SCOPE');
  if(!['Продажа','Возврат'].includes(op)||f['Тип документа']!==op)throw Error('EXCEL_SALES_EVENT_CONTEXT');
  if(f['Кол-во']!=='1')throw Error('EXCEL_SALES_UNIT_GRAIN_UNVERIFIED');
  if (![row.reportId,f['№'],f['Код номенклатуры']].every(v=>Number.isSafeInteger(Number(v))&&Number(v)>0)) throw Error('EXCEL_SALES_UNSAFE_ID');
  const date=day(f['Дата продажи']);if(date<'2025-09-05'||date>='2026-07-14')throw Error('EXCEL_SALES_OUTSIDE_APPROVED_HISTORY');
  const product=byNm.get(f['Код номенклатуры']);if(!product||!f.Srid?.trim())throw Error('EXCEL_SALES_PRODUCT_OR_SRID');
  const kind=op==='Возврат'?'RETURN':'SALE';const key=f.Srid+'\0'+kind;if(identities.has(key))throw Error('EXCEL_SALES_DUPLICATE_EVENT');identities.add(key);
  const price=money(f['Цена розничная с учетом согласованной скидки']);if(price<=0)throw Error('EXCEL_SALES_INVALID_PRICE');
  return {marketplace_account_id:'6',report_id:Number(row.reportId),source_row_number:Number(f['№']),file_sha256:row.fileSha256,product_id:product,nm_id:Number(f['Код номенклатуры']),srid:f.Srid.trim(),event_type:kind,sale_date:date,quantity:1,price_with_disc:price,customer_paid:Math.abs(money(f['Вайлдберриз реализовал Товар (Пр)'])),finance_payable_raw:money(f['К перечислению Продавцу за реализованный Товар']),barcode:f['Баркод']?.trim()||null,tech_size:f['Размер']?.trim()||null,warehouse:f['Склад']?.trim()||null};
 });
}
/** Reporting adapter: a report event has a source identity, never a WB-native saleID. */
export function excelEvidenceToReportingSale(row:ExcelSalesEvidence):WbSale {
 return {id:`xlsx-sale:${row.report_id}:${row.source_row_number}`,data_source:'WB_EXCEL',marketplace_account_id:row.marketplace_account_id,sale_id:null,event_type:row.event_type,srid:row.srid,nm_id:row.nm_id,product_id:row.product_id,sale_date:row.sale_date,revenue:row.customer_paid,quantity:1,is_return:row.event_type==='RETURN',return_date:row.event_type==='RETURN'?row.sale_date:null,barcode:row.barcode,tech_size:row.tech_size,warehouse:row.warehouse,price_with_disc:row.price_with_disc};
}
