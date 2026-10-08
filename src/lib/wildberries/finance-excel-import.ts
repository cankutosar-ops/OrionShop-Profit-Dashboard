import { resolveFinanceCategory, categoryToOperationType } from '@/lib/finance-category';
import type { WbFinance } from '@/types/database';
export type PreparedExcelRow = {
 targetAccountId:number;targetCompanyId:number;reportId:string;fileSha256:string;sourceOrdinal:string;
 fields:Record<string,string>;
};
export const EXCEL_FINANCE_FIELDS: Record<string,string[]> = {
 commission:['Вознаграждение с продаж до вычета услуг поверенного, без НДС'],
 logistics:['Услуги по доставке товара покупателю'],storage:['Хранение'],penalty:['Общая сумма штрафов'],
 return_logistics:['Возмещение издержек по перевозке/по складским операциям с товаром'],
 deduction:['Удержания'],acceptance:['Операции на приемке'],
 acquiring_fee:['Компенсация платёжных услуг/Комиссия за интеграцию платёжных сервисов','Эквайринг/Комиссия за организацию платежей','Эквайринг'],
 ppvz_reward:['Возмещение за выдачу и возврат товаров на ПВЗ'],
 ppvz_vw:['Вознаграждение Вайлдберриз (ВВ), без НДС'],vw_nds:['НДС с Вознаграждения Вайлдберриз'],
 additional_payment:['Корректировка Вознаграждения Вайлдберриз (ВВ)'],
 installment_cofinancing:['Скидка по программе софинансирования'],
 cashback_amount:['Сумма баллов, удержанных по программе лояльности'],cashback_discount:['Компенсация скидки по программе лояльности'],
 cashback_commission_change:['Стоимость участия в программе лояльности'],
 payment_schedule:['Разовое изменение срока перечисления денежных средств'],
 for_pay:['К перечислению Продавцу за реализованный Товар'],
};
function decimal(raw:string):number {
 const clean=raw.replace(/[\s\u00a0]/g,'').replace(',','.');
 if(!/^-?\d+(\.\d+)?$/.test(clean))throw Error('EXCEL_INVALID_MONEY');
 const value=Number(clean);if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER/100)throw Error('EXCEL_UNSAFE_MONEY');return value;
}
function day(raw:string):string {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw Error('EXCEL_DATE_FORMAT_UNVERIFIED');
 const date=new Date(`${raw}T00:00:00Z`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==raw||raw<'2000-01-01')throw Error('EXCEL_INVALID_DATE');return raw;
}
export function buildWbExcelReportPlan(rows:PreparedExcelRow[],accountId:number,companyId:number,products:Array<{id:string;nm_id:number}>) {
 if(!rows.length)throw Error('EXCEL_EMPTY_REPORT');const first=rows[0];
 const map=new Map(products.map(p=>[String(p.nm_id),p.id]));
 const seen=new Set<string>();const dates:string[]=[];const lines:Array<Omit<WbFinance,'id'>>=[];
 for(const r of rows) {
  if(r.targetAccountId!==accountId||r.targetCompanyId!==companyId||r.reportId!==first.reportId||r.fileSha256!==first.fileSha256||!/^[a-f0-9]{64}$/.test(r.fileSha256)||!/^\d+$/.test(r.reportId)||!/^\d+$/.test(r.sourceOrdinal)||Number(r.sourceOrdinal)<1||Number(r.sourceOrdinal)>rows.length)throw Error('EXCEL_SOURCE_SCOPE_MISMATCH');
  if(seen.has(r.sourceOrdinal))throw Error('EXCEL_DUPLICATE_ORDINAL');seen.add(r.sourceOrdinal);
  const f=r.fields,date=day(f['Дата продажи']);dates.push(date);
  const nm=f['Код номенклатуры'];if(nm&&!/^\d+$/.test(nm))throw Error('EXCEL_INVALID_NM');
  const productId=nm&&nm!=='0'?map.get(nm):null;if(nm&&nm!=='0'&&!productId)throw Error('EXCEL_PRODUCT_ACCOUNT_MISMATCH');
  const op=f['Обоснование для оплаты']?.trim()||null;
  const isReturn=f['Тип документа']?.trim()==='Возврат'||op==='Возврат';
  for(const [suffix,headers]of Object.entries(EXCEL_FINANCE_FIELDS)) {
   const values=headers.filter(h=>Object.hasOwn(f,h));if(values.length>1)throw Error('EXCEL_AMBIGUOUS_HEADER');if(!values.length)continue;
   const value=f[values[0]];if(value===''||value==null)continue;const raw=decimal(value);if(raw===0)continue;
   const signed=suffix==='for_pay'?(isReturn?-Math.abs(raw):Math.abs(raw)):raw;
   const category=resolveFinanceCategory({wbFieldSuffix:suffix,supplierOperName:op});
   lines.push({marketplace_account_id:String(accountId),product_id:productId??null,nm_id:nm&&nm!=='0'?Number(nm):null,
    operation_date:date,operation_type:categoryToOperationType(category),amount:suffix==='for_pay'?signed:Math.abs(signed),raw_amount:signed,
    source_key:`xlsx:${r.reportId}:${r.sourceOrdinal}:${suffix}`,description:JSON.stringify({source:'WB_EXCEL',fileSha256:r.fileSha256,dateBasis:'SOURCE_SALE_DATE'}),
    srid:f.Srid?.trim()||null,finance_category:category,wb_source_suffix:suffix,supplier_oper_name:op,finance_nature:null,
    realizationreport_id:Number(r.reportId),rrd_id:null,rr_dt:null});
  }
 }
 dates.sort();return {report:{reportId:first.reportId,fileSha256:first.fileSha256,sourceRowCount:rows.length,eventDateFrom:dates[0],eventDateTo:dates.at(-1),dateBasis:'SOURCE_SALE_DATE'},lines};
}

