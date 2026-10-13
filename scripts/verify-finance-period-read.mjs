import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchFinancePeriodRows } from "../src/services/finance-period-read-service.ts";
import { summarizeFinanceByCategory, rollupCategoriesToProfitBuckets, buildMarketplaceFeesPresentationFromFinance } from "../src/lib/finance-rollup.ts";
import { buildProductProfitabilityResult } from "../src/lib/product-profitability-builder.ts";
import { sumNetForPayFromFinance, countFinanceForPayLines } from "../src/lib/wb-settlement.ts";
import { summarizeUnallocatedDashboardFinance } from "../src/lib/dashboard-finance-scope.ts";
import { tablePage } from "../src/lib/ui/table-page.ts";
import { mapWithConcurrency } from "../src/lib/async-map.ts";
import { withReadBudget } from "../src/lib/supabase/read-budget.ts";
import { setTimeout as delay } from "node:timers/promises";

// Local Docker only; real migration and existing tenant helper, no production URL/keys.
const container = "supabase_db_OrionShop-Profit-Dashboard";
const db = "orion_finance_period_test_" + Date.now();
const sql = (query, database = db) => execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 40 * 1024 * 1024 }).trim();
sql('create database "' + db + '";', "postgres");
const helper = sql(`select pg_get_functiondef(p.oid) || ';' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('orion_jwt_company_ids','orion_jwt_marketplace_account_ids_claim'))
 or (n.nspname='private' and p.proname='orion_allowed_marketplace_account_ids') order by n.nspname desc;`, "orionshop_prerelease_20260924");
sql(`create schema auth; create schema private;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
create table public.marketplace_accounts(id bigint primary key,company_id bigint);
insert into public.marketplace_accounts values(6,3),(2,1);
${helper}
grant usage on schema auth,private to authenticated;
grant execute on all functions in schema auth,private to authenticated;
create table public.wb_finance(id bigint primary key,marketplace_account_id bigint, product_id bigint,nm_id bigint,
 operation_date date,operation_type text,amount numeric,raw_amount numeric,
 source_key text,description text,srid text,finance_category text,wb_source_suffix text,supplier_oper_name text);
alter table public.wb_finance enable row level security;
create policy tenant_select_wb_finance on public.wb_finance for select to authenticated using
 (marketplace_account_id=any((select private.orion_allowed_marketplace_account_ids())::bigint[]));
grant select on public.wb_finance to authenticated;
create index on public.wb_finance(marketplace_account_id,operation_date,id);`);
sql(readFileSync(new URL("../supabase/migrations/20261013173427_finance_period_read_model.sql", import.meta.url), "utf8"));
const components = [
 ["OTHER","for_pay","other"], ["LOGISTICS","logistics","logistics"], ["STORAGE","storage","storage"],
 ["COMMISSION","commission","commission"], ["ACQUIRING","acquiring_fee","other"],
 ["PPVZ_VW","ppvz_vw","other"], ["PPVZ_VW_NDS","vw_nds","other"], ["OTHER","acceptance","other"],
 ["ADJUSTMENT","deduction","other"], ["RETURN_LOGISTICS","return_logistics","return_logistics"],
 ["PENALTY","penalty","penalty"], ["COMPENSATION","additional_payment","other"],
];
const source = Array.from({length: 7013}, (_, i) => {
 const [cat,suffix,operation] = components[i % components.length];
 return {id:String(i+1),marketplace_account_id:"6",product_id:i%17===0?null:"10",nm_id:100,
 operation_date:i%2?"2026-09-19":"2026-09-20",operation_type:operation,
 amount:i%7===0?0:i%3===0?-1.23:2.34,raw_amount:i%19===0?null:i%7===0?-0.91:i%3===0?-1.23:2.34,
 source_key:`r:${i}:${suffix}`,description:"Продажа",srid:"s1",
 finance_category:i%23===0?null:cat,wb_source_suffix:i%29===0?null:suffix,
 supplier_oper_name:i%31===0?null:"Продажа"};
});
const extra = [{...source[0],id:"8001",marketplace_account_id:"2",amount:999999},
 {...source[0],id:"8002",operation_date:"2026-08-20",amount:999999},
 {...source[0],id:"8003",product_id:"20",amount:999999}];
sql(`insert into public.wb_finance select * from jsonb_populate_recordset(null::public.wb_finance,
 '${JSON.stringify([...source,...extra]).replaceAll("'","''")}'::jsonb);`);
const claims = {sub:"00000000-0000-0000-0000-000000000001",app_metadata:{orion:{company_ids:[3]}}};
const prefix = `set role authenticated; set request.jwt.claims='${JSON.stringify(claims)}';`;
const result = JSON.parse(sql(prefix + "select public.orion_finance_period_rows(6,'2026-09-19','2026-09-20',array[10::bigint]);"));
assert.equal(result.sourceRows,source.length);
assert.ok(result.emittedRows > 1000,"scalar response preserves more than the API's usual 1000-row cap");
assert.ok(result.emittedRows < source.length / 2);
assert.equal(result.rows.length,result.emittedRows);
assert.equal(new Set(result.rows.map(r=>r.id)).size,result.emittedRows);
nearlyEqual(summarizeFinanceByCategory(result.rows),summarizeFinanceByCategory(source));
function nearlyEqual(a,b,path="") {
 if(typeof a==="number" && typeof b==="number") { assert.ok(Math.abs(a-b)<0.00001,path+": "+a+" != "+b); return; }
 if(a && typeof a==="object") { assert.deepEqual(Object.keys(a),Object.keys(b)); for(const k of Object.keys(a))nearlyEqual(a[k],b[k],path+"."+k); return; }
 assert.deepEqual(a,b,path);
}
nearlyEqual(rollupCategoriesToProfitBuckets(result.rows),rollupCategoriesToProfitBuckets(source));
nearlyEqual(buildMarketplaceFeesPresentationFromFinance(result.rows,0,100,80),buildMarketplaceFeesPresentationFromFinance(source,0,100,80));
nearlyEqual(sumNetForPayFromFinance(result.rows),sumNetForPayFromFinance(source));
assert.equal(countFinanceForPayLines(result.rows),countFinanceForPayLines(source));
nearlyEqual(summarizeUnallocatedDashboardFinance(result.rows.filter(r=>r.product_id==null)),summarizeUnallocatedDashboardFinance(source.filter(r=>r.product_id==null)));
const input = {products:[{id:"10",marketplace_account_id:"6",nm_id:100,supplier_article:"fixture",name:"Fixture",brand_id:"1",category_id:"1"}],
 sales:[{product_id:"10",nm_id:100,srid:"s1",sale_date:"2026-09-19",quantity:1,is_return:false,revenue:100,price_with_disc:100,for_pay:80}],
 orders:[],ads:[],costHistory:[]};
nearlyEqual(buildProductProfitabilityResult({...input,finance:result.rows}),buildProductProfitabilityResult({...input,finance:source}));
assert.equal(JSON.parse(sql(prefix+"select public.orion_finance_period_rows(2,'2026-09-19','2026-09-20');")).sourceRows,0,"other company is inaccessible");
assert.equal(JSON.parse(sql(`set role authenticated; set request.jwt.claims='${JSON.stringify({...claims,app_metadata:{orion:{company_ids:[3],marketplace_account_ids:[2]}}})}';select public.orion_finance_period_rows(6,'2026-09-19','2026-09-20');`)).sourceRows,0);
assert.equal(sql("select has_function_privilege('anon','public.orion_finance_period_rows(bigint,date,date,bigint[])','execute');"),"f");
assert.equal(sql("select prosecdef from pg_proc where oid='public.orion_finance_period_rows(bigint,date,date,bigint[])'::regprocedure;"),"f");
assert.equal(JSON.parse(sql(prefix+"select public.orion_finance_period_rows(6,'2026-09-19','2026-09-20',array[]::bigint[]);")).sourceRows,source.filter(r=>r.product_id==null).length);
assert.throws(()=>sql("select public.orion_finance_period_rows(6,'2026-09-20','2026-09-19');"),/Invalid Finance period/);
console.log("PASS local SQL: "+source.length+" → "+result.emittedRows+" rows; signed fees/raw evidence, zero rows, legacy evidence, logistics, returns, product profit and RLS/ACL parity; database "+db);

const original=globalThis.fetch;
let mode="ready",calls=[];
const scope={companyId:"3",marketplaceAccountId:"6",from:"2026-09-19",to:"2026-09-20"};
const client=createClient("https://fixture.invalid","fixture");
try {
 globalThis.fetch=async(input,init)=>{
  const u=new URL(String(input));calls.push(u);
  if(u.pathname.includes("/rpc/")){
   assert.deepEqual(JSON.parse(init.body),{p_account_id:"6",p_from:scope.from,p_to:scope.to,p_product_ids:["10"]});
   if(mode==="missing")return Response.json({code:"PGRST202",message:"function not found"},{status:404});
   if(mode==="denied")return Response.json({code:"42501",message:"permission denied"},{status:403});
   if(mode==="truncated")return Response.json({...result,rows:result.rows.slice(1)});
   if(mode==="wrongAccount")return Response.json({...result,rows:[{...result.rows[0],marketplace_account_id:"2"},...result.rows.slice(1)]});
   return Response.json(result);
  }
  const rows = [{...source[1],marketplace_account_id:"6"}];
  return Response.json(rows,{headers:{"content-range":"0-0/1"}});
 };
 const options={columns:"id,product_id,amount",productIds:["10"]};
 assert.equal((await fetchFinancePeriodRows(scope,client,options)).length,result.emittedRows);
 assert.equal(calls.length,1);
 for(mode of ["denied","truncated","wrongAccount"]) {calls=[];await assert.rejects(fetchFinancePeriodRows(scope,client,options));assert.equal(calls.length,1,"errors must not fan out into raw reads");}
 mode="missing";calls=[];assert.ok((await fetchFinancePeriodRows(scope,client,options)).length>0);assert.ok(calls.length>1,"absent additive migration retains raw reader");
} finally {globalThis.fetch=original;}
let active=0,peak=0;
const mapped=await mapWithConcurrency([4,3,2,1],2,async v=>{active++;peak=Math.max(peak,active);await delay(v);active--;return v*2;});
assert.deepEqual(mapped,[8,6,4,2]);assert.equal(peak,2);
let started=0;
await assert.rejects(mapWithConcurrency([1,2,3,4,5],2,async()=>{started++;throw Error("failed");}),/failed/);
assert.ok(started<=2,"failure stops queued work");
await assert.rejects(withReadBudget(()=>mapWithConcurrency([1,2,3],1,async()=>{await delay(100);return 1;}),10));
console.log("PASS period service: single request, fail closed, rollout fallback, bounded ordered periods and cancellation");


const manyRows = Array.from({length:10001}, (_,i)=>({id:i,amount:i*3}));
const collected = [];
for(let page=1;page<=201;page++) {
 const result = tablePage(manyRows,page);
 assert.ok(result.rows.length<=50);
 collected.push(...result.rows);
}
assert.deepEqual(collected,manyRows,"pagination changes only rendering; no row is lost or counted twice");
assert.equal(tablePage(manyRows,999).page,201);
assert.equal(tablePage([],1).rows.length,0);
let cancelled = 0;
const external = new AbortController();
const operation = withReadBudget(async()=>new Promise((resolve,reject)=>{
 import("../src/lib/supabase/read-budget.ts").then(({getReadBudgetSignal})=>{
 const signal=getReadBudgetSignal();signal.addEventListener("abort",()=>{cancelled++;reject(signal.reason);},{once:true});
 });
}),1000,undefined,external.signal);
await delay(10);external.abort();await assert.rejects(operation);assert.equal(cancelled,1);
console.log("PASS 10,001 product rendering pagination and externally cancelled server reads");
