import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveWbAdvertisingCost } from "../src/lib/wb-advertising-cost-policy.ts";
import { buildMarketplaceFeesPresentationFromFinance, buildProductMarketplaceFeeParts, summarizeFinanceByCategory, rollupCategoriesToProfitBuckets, sumFinanceByType } from "../src/lib/finance-rollup.ts";
import { calculateModelBNetProfit, verifyModelBFinalProfitArithmetic } from "../src/lib/financial-engine.ts";
import { buildWbSettlementMetrics } from "../src/lib/wb-settlement.ts";
import { buildProductProfitabilityResult } from "../src/lib/product-profitability-builder.ts";
import { buildProductAnalyticsTotals } from "../src/lib/product-analytics.ts";
import { buildPnLFromModelB, buildPnLFromProductRows } from "../src/lib/reporting/module/pnl-report.ts";
import { mapFinanceRowsFromV1Detailed } from "../src/lib/wildberries/finance-v1.ts";
import { buildWbExcelReportPlan } from "../src/lib/wildberries/finance-excel-import.ts";
import { assertFinanceApiReportOwnership } from "../src/lib/wildberries/finance-source-ownership.ts";

const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<0.005,`${label}: ${actual} != ${expected}`);
const row=(account,suffix,amount,raw=amount,productId=null)=>({id:`${account}:${suffix}:${amount}`,marketplace_account_id:String(account),product_id:productId,nm_id:productId?123:null,operation_date:"2026-08-04",operation_type:"other",finance_category:suffix==="deduction"?"ADJUSTMENT":suffix==="commission"?"COMMISSION":"OTHER",wb_source_suffix:suffix,amount,raw_amount:raw,source_key:`rrd:${account*1000+Math.round(Math.abs(amount))}:${suffix}`,realizationreport_id:9000+account,srid:null,description:null,supplier_oper_name:suffix==="deduction"?"Удержание":"Продажа"});
const base={grossSales:100000,returnedSales:0,netSales:100000,netSalesStatus:"ready",salesForPay:80000,financeNetForPay:80000,acquiring:0,logistics:0,storage:0,penalties:0,acceptance:0,productCost:0,estimatedTaxOverride:0};
const months=[{month:"July",charges:62228.70,credits:[49286.14,20000],net:-7057.44},{month:"August",charges:203489,credits:[27376.8],net:176112.20}];
for(const account of [1,2,6]){
  for(const m of months){
    // Old imports contain positive amount and signed raw_amount. New imports store both signed.
    const old=[row(account,"deduction",m.charges),...m.credits.map(v=>row(account,"deduction",v,-v))];
    const current=old.map(r=>({...r,amount:r.raw_amount}));
    for(const finance of [old,current]){
      near(summarizeFinanceByCategory(finance).ADJUSTMENT,m.net,`${account} ${m.month} category`);
      near(buildProductMarketplaceFeeParts(finance).accountAdjustments,m.net,`${account} product credits`);
      near(rollupCategoriesToProfitBuckets(finance).other,m.net,`${account} profit bucket credits`);
      near(sumFinanceByType(finance,"other"),m.net,`${account} legacy bucket credits`);
      const adjustments=buildMarketplaceFeesPresentationFromFinance(finance,0).accountAdjustments;
      const policy=resolveWbAdvertisingCost([{spend:10000}]);
      const model=calculateModelBNetProfit({...base,adjustments,advertising:policy.additionalProfitDeduction});
      near(model.operatingProfit,80000-m.net,"V4 credit effect");
      assert.equal(verifyModelBFinalProfitArithmetic(model),0);
      near(buildWbSettlementMetrics({netForPay:80000,finance,logistics:0,dataSource:"finance_transaction"}).settlement,80000-m.net,"Settlement credit effect");
      near(buildPnLFromModelB(model).lines.find(r=>r.id==="adjustments").amount,m.net,"P&L sign");
    }
  }
  // Same advertising represented by a Finance invoice and a campaign must be charged once.
  const policy=resolveWbAdvertisingCost([{spend:10000}]);
  assert.equal(policy.policy,"FINANCE_HOLDS_ONLY");assert.equal(policy.campaignSpend,10000);assert.equal(policy.additionalProfitDeduction,0);
  assert.equal(resolveWbAdvertisingCost([]).additionalProfitDeduction,0);
  const finance=[row(account,"for_pay",80000,80000,"p"),row(account,"deduction",10000,10000,"p"),row(account,"deduction",500, -500,"p")];
  const products=[{id:"p",marketplace_account_id:String(account),nm_id:123,supplier_article:"SKU",name:"Fixture",brand_id:null,category_id:null,brand:null,category:null}];
  const ads=[{id:"a",product_id:"p",marketplace_account_id:String(account),spend:10000}, {id:"foreign",product_id:"other-company-product",marketplace_account_id:"999",spend:900000}];
  const input={products,finance,ads,orders:[],sales:[],costHistory:[]};
  const product=buildProductProfitabilityResult(input).rows[0];
  assert.equal(product.advertising,0);assert.equal(product.advertisingCampaignSpend,10000);
  near(product.netProfit,70500,"Product expense counted once");
  near(product.accountAdjustments,9500,"Product signed net deductions");
  assert.equal(buildProductAnalyticsTotals([product]).marketing,10000,"Campaign statistics remain available");
  assert.equal(buildPnLFromProductRows([product]).lines.find(r=>r.id==="advertising").amount,0,"Reports must not add campaign statistics back");
  assert.equal(buildProductProfitabilityResult({...input,ads:[]}).rows[0].netProfit,product.netProfit,"Campaign arrival/removal cannot change financial profit");
  assert.equal(buildProductProfitabilityResult({...input,finance:[]}).rows[0].advertising,0,"No guessed fallback expense when Finance is unpublished");

  const mapped=mapFinanceRowsFromV1Detailed({rrdId:account*100+1,reportId:9000+account,rrDate:"2026-08-04",sellerOperName:"Удержание",bonusTypeName:"WB Продвижение document 123",deduction:"-27376.80"},null);
  near(mapped[0].amount,-27376.8,"Future V1 credit amount");near(mapped[0].raw_amount,-27376.8,"Future V1 raw credit");
  assert.equal(JSON.parse(mapped[0].description).chargeReason,"WB Продвижение document 123");
  assert.equal(mapFinanceRowsFromV1Detailed({rrdId:account*100+1,rrDate:"2026-08-04",deduction:"0"},null)[0].amount,0,"Zero corrections remain authoritative");
  for(const reasonHeader of ["Виды логистики, штрафов и корректировок ВВ","Виды доставок, штрафов и корректировок ВВ"]){
    const plan=buildWbExcelReportPlan([{targetAccountId:account,targetCompanyId:account,reportId:"9001",fileSha256:"a".repeat(64),sourceOrdinal:"1",fields:{"Дата продажи":"2026-08-04","Код номенклатуры":"0","Обоснование для оплаты":"Удержание","Удержания":"-27376,80",[reasonHeader]:"Unused advance refund"}}],account,account,[]);
    near(plan.lines[0].amount,-27376.8,"Future Excel credit");assert.equal(JSON.parse(plan.lines[0].description).chargeReason,"Unused advance refund");
    assert.deepEqual(plan,buildWbExcelReportPlan([{targetAccountId:account,targetCompanyId:account,reportId:"9001",fileSha256:"a".repeat(64),sourceOrdinal:"1",fields:{"Дата продажи":"2026-08-04","Код номенклатуры":"0","Обоснование для оплаты":"Удержание","Удержания":"-27376,80",[reasonHeader]:"Unused advance refund"}}],account,account,[]));
  }
}
const legacy=row(1,"deduction",10,null);assert.equal(summarizeFinanceByCategory([legacy]).ADJUSTMENT,10,"Missing raw is not a zero credit");
assert.equal(summarizeFinanceByCategory([{...legacy,amount:-10}]).ADJUSTMENT,-10,"Explicit signed legacy amount remains signed");
const neutral=[row(1,"commission",10,-10),row(1,"acquiring_fee",12,-12),row(1,"for_pay",100,-100)];
assert.equal(summarizeFinanceByCategory(neutral).COMMISSION,10,"Commission magnitude convention unchanged");
near(calculateModelBNetProfit({...base,adjustments:0,advertising:1000}).operatingProfit,79000,"V4 still supports explicit advertising inputs");
assert.throws(()=>resolveWbAdvertisingCost([{spend:NaN}]),/Invalid/);

// Source ownership is account-scoped, read-only and fails before any write on overlap/errors.
let readCount=0,filters=[];
function mockLedger(data=[],error=null){return {from(table){assert.equal(table,"wb_finance_excel_imports");return {select(){return this;},eq(column,value){filters.push([column,value]);return this;},in(column,value){assert.equal(column,"report_id");return this;},limit(){readCount++;return Promise.resolve({data,error});}};}};}
for(const account of [1,2,6]){
 const lines=[row(account,"deduction",10000)];
 await assertFinanceApiReportOwnership(mockLedger(),lines);
 assert.deepEqual(filters.at(-1),["marketplace_account_id",String(account)]);
 await assert.rejects(assertFinanceApiReportOwnership(mockLedger([{report_id:9000+account}]),lines),/already imported from Excel/);
 await assert.rejects(assertFinanceApiReportOwnership(mockLedger([], {code:"TIMEOUT"}),lines),/could not be verified/);
}
await assert.rejects(assertFinanceApiReportOwnership(mockLedger(),[row(1,"deduction",1),row(2,"deduction",2)]),/one valid account/);
await assert.rejects(assertFinanceApiReportOwnership(mockLedger(null),[row(1,"deduction",1)]),/could not be verified/);const reads=readCount;await assertFinanceApiReportOwnership(mockLedger(),[]);assert.equal(readCount,reads);
for(const file of ["src/services/dashboard-service.ts","src/lib/product-profitability-builder.ts"]){
 const code=readFileSync(file,"utf8");assert.match(code,/resolveWbAdvertisingCost/);assert.match(code,/additionalProfitDeduction/);assert.match(code,/advertisingCampaignSpend/);
}
const sync=readFileSync("src/lib/wildberries/sync-service.ts","utf8");
const block=sync.slice(sync.indexOf("async function batchUpsertFinance("),sync.indexOf("export type WbFinancePageSyncResult"));
assert.ok(block.indexOf("assertFinanceApiReportOwnership")<block.indexOf("for (let i"),"Ownership must be verified before the first batch write");
assert.match(block,/onConflict: "marketplace_account_id,source_key"/);
console.log("PASS WB Finance cost ownership: three accounts, historical/new signed credits, P&L/Settlement/product parity, Ads informational, no double-count, zero corrections, replay, report ownership/isolation and fail-closed lookup. No DB/API writes.");
