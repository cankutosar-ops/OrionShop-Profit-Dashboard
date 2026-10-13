import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {fetchFinanceInRange} from '../src/services/persisted-query-service.ts';
import {summarizeFinanceByCategory,buildMarketplaceFeesPresentationFromFinance} from '../src/lib/finance-rollup.ts';
import {navigateDashboardDateRange} from '../src/lib/scope-navigation.ts';
import {fetchDashboardCompanies,invalidateDashboardCompaniesCache} from '../src/lib/dashboard-lifecycle.ts';
const originalFetch=globalThis.fetch, originalWindow=globalThis.window;
const source=[
  {id:'1',product_id:'10',nm_id:100,srid:'s1',marketplace_account_id:'6',operation_date:'2026-05-13',operation_type:'other',amount:0,raw_amount:12,source_key:'report:1:vw_nds',description:'large audit description',finance_category:'PPVZ_VW_NDS',wb_source_suffix:'vw_nds',supplier_oper_name:'Продажа'},
  {id:'2',product_id:null,nm_id:100,srid:'s1',marketplace_account_id:'6',operation_date:'2026-05-13',operation_type:'other',amount:-5,raw_amount:-5,source_key:'legacy:2:storage',description:'Хранение',finance_category:null,wb_source_suffix:null,supplier_oper_name:null},
  {id:'3',product_id:'10',nm_id:100,srid:'s1',marketplace_account_id:'6',operation_date:'2026-05-13',operation_type:'other',amount:75,raw_amount:75,source_key:'report:3:for_pay',description:'large audit description',finance_category:'OTHER',wb_source_suffix:'for_pay',supplier_oper_name:'Продажа'},
];
let queries=[],failLegacy=false;
try {
  globalThis.fetch=async(input)=>{
    const u=new URL(String(input));queries.push(u);assert.equal(u.searchParams.get('marketplace_account_id'),'eq.6');
    let rows=source;
    for(const [key,value]of u.searchParams){
      if(value.startsWith('in.'))rows=rows.filter(r=>value.slice(4,-1).split(',').includes(String(r[key])));
      if(value==='is.null')rows=rows.filter(r=>r[key]==null);
    }
    if(failLegacy&&u.searchParams.has('id'))return Response.json({message:'legacy evidence unavailable'},{status:500});
    const total=rows.length,select=u.searchParams.get('select');
    if(select!=='*')rows=rows.map(r=>Object.fromEntries(select.split(',').map(c=>[c,r[c]])));
    return Response.json(rows,{headers:{'content-range':`0-${rows.length-1}/${total}`}});
  };
  const client=createClient('https://fixture.invalid','fixture');
  const scope={companyId:'3',marketplaceAccountId:'6',from:'2026-05-13',to:'2026-10-13'};
  const columns=Object.keys(source[0]).join(',');
  const full=await fetchFinanceInRange(scope,client,{columns,productIds:['10']});
  queries=[];
  const compact=await fetchFinanceInRange(scope,client,{columns,productIds:['10'],compactMetadata:true});
  assert.equal(compact.length,3);assert.deepEqual(summarizeFinanceByCategory(compact),summarizeFinanceByCategory(full));
  assert.deepEqual(buildMarketplaceFeesPresentationFromFinance(compact,0,100,80),buildMarketplaceFeesPresentationFromFinance(full,0,100,80));
  assert.equal(compact.find(r=>r.id==='2').description,'Хранение');
  assert.equal(compact.find(r=>r.id==='1').raw_amount,12,'zero amount with signed raw evidence is preserved');
  assert.ok(queries.filter(u=>u.searchParams.has('id')).every(u=>u.searchParams.get('id')==='in.(2)'));
  failLegacy=true;await assert.rejects(fetchFinanceInRange(scope,client,{columns,compactMetadata:true}),/legacy evidence unavailable/);
  const routes=[];globalThis.window={location:{assign:href=>routes.push(['document',href])}};
  const router={push:href=>routes.push(['router',href]),replace:()=>{throw Error('unexpected replacement')}};
  navigateDashboardDateRange(router,'/','/?account=6&from=2026-05-13&to=2026-10-13','2026-05-13','2026-10-13');
  navigateDashboardDateRange(router,'/','/?account=6&from=2026-10-01&to=2026-10-13','2026-10-01','2026-10-13');
  navigateDashboardDateRange(router,'/analytics/products','/analytics/products?account=6','2026-05-13','2026-10-13');
  assert.deepEqual(routes.map(r=>r[0]),['document','router','router']);assert.equal(routes.length,3,'exactly one navigation, no timed automatic retry');
  const timeout=AbortSignal.timeout;
  AbortSignal.timeout=ms=>{assert.equal(ms,15000);return timeout(25)};
  let aborted=0;
  try {
    globalThis.fetch=async(_input,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>{aborted++;reject(init.signal.reason)},{once:true}));
    invalidateDashboardCompaniesCache();
    const pending=Promise.allSettled([fetchDashboardCompanies(),fetchDashboardCompanies()]);
    const keepAlive=setTimeout(()=>{},100);
    const failed=await pending;clearTimeout(keepAlive);
    assert.ok(failed.every(r=>r.status==='rejected'));assert.equal(aborted,1,'parallel selector reads share one bounded request');
    globalThis.fetch=async()=>Response.json({companies:[{id:'3'}]});
    assert.deepEqual(await fetchDashboardCompanies(),[{id:'3'}],'failed in-flight request must release the next navigation');
  } finally {AbortSignal.timeout=timeout;invalidateDashboardCompaniesCache();}
  console.log('PASS long Dashboard: unchanged signed fee/category totals, legacy hydration/scope, zero evidence, single document navigation and bounded selector recovery');
} finally {globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
