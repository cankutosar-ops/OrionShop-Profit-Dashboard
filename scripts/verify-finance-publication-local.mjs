/** Local restored Docker DB only. Never calls WB; synthetic account cleaned up. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createSupabaseFinanceIncrementalStateStore } from '../src/lib/finance-incremental/state.ts';
import { runFinanceReportsV1PageWake } from '../src/lib/finance-incremental/page-wake.ts';
import { readFinancePublicationEvidence } from '../src/lib/finance-incremental/publication.ts';
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'127.0.0.1');
const account='990003';
function sql(q){const r=spawnSync('docker',['exec','-i','supabase_db_OrionShop-Profit-Dashboard','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','orionshop_rc_20260920'],{input:q,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
assert.equal(sql(`SELECT count(*) FROM public.marketplace_accounts WHERE id=${account}`),'0');
const nativeFetch=globalThis.fetch;globalThis.fetch=(url,...args)=>{assert.equal(new URL(typeof url==='string'?url:url.url??String(url)).hostname,'127.0.0.1');return nativeFetch(url,...args);};
sql(`INSERT INTO public.marketplace_accounts(id,company_id,marketplace,account_name,is_active) SELECT ${account},min(id),'wildberries','LOCAL PUBLICATION FIXTURE',false FROM public.companies;`);
try{
 const store=createSupabaseFinanceIncrementalStateStore();
 const terminal={kind:'terminal',httpStatus:204,apiRows:0,persistedLines:0,hasMore:false,isEmpty:true,nextRrdId:null,reportIds:[],returnedFrom:null,returnedTo:null,errors:[],remaining:0,limit:1,resetSeconds:null,retrySeconds:null};
 const deps={loadAccount:async()=>({id:account,sellerId:null,apiKey:'synthetic'}),readState:id=>store.read(id),acquireLease:(id,o)=>store.acquireLease(id,o),renewLease:(id,o)=>store.renewLease(id,o),commitLease:(s,o,r)=>store.commitLease(s,o,r),assertLiveAllowed(){},assertTokenReady(){},syncPage:async()=>terminal,readPublicationEvidence:readFinancePublicationEvidence};
 const input={accountId:account,weekFrom:'2026-09-07',weekTo:'2026-09-13',rrdId:0,mode:'current_week'};
 // Optional old-release import is prepared privately from the approved git SHA.
 if(process.env.PUBLICATION_BEFORE_MODULE){const {runFinanceReportsV1PageWake:old}=await import(process.env.PUBLICATION_BEFORE_MODULE);assert.equal((await old(input,deps)).status,'week_complete');sql(`DELETE FROM public.finance_incremental_sync_state WHERE marketplace_account_id=${account};`);console.log('BEFORE: uncorroborated 204 durably marked complete');}
 assert.equal((await runFinanceReportsV1PageWake(input,deps)).status,'awaiting_publication');
 let saved=await createSupabaseFinanceIncrementalStateStore().read(account);
 assert.equal(saved.weekStatus,'in_progress');assert.equal(saved.lastPersistedRrdId,0);assert.equal(saved.lastError,'awaiting_publication');assert.deepEqual(saved.completedWeeks,{});assert.equal(saved.lockOwner,null);
 sql(`UPDATE public.finance_incremental_sync_state SET last_persisted_rrd_id=9,reports_next_request_not_before=NULL WHERE marketplace_account_id=${account};`);
 assert.equal((await runFinanceReportsV1PageWake({...input,rrdId:9},deps)).status,'awaiting_publication');
 saved=await createSupabaseFinanceIncrementalStateStore().read(account);assert.equal(saved.lastPersistedRrdId,9);
 sql(`INSERT INTO public.warehouse_sales_report_snapshot(marketplace_type,company_id,marketplace_account_id,report_id,date_from,date_to,create_date,observed_at,meta) SELECT 'wildberries',company_id,id,990003,'2026-09-07','2026-09-13','2026-09-14','2026-09-19T00:00:00Z','{"source":"wb_sales_reports_list"}' FROM public.marketplace_accounts WHERE id=${account}; UPDATE public.finance_incremental_sync_state SET reports_next_request_not_before=NULL WHERE marketplace_account_id=${account};`);
 assert.equal((await runFinanceReportsV1PageWake({...input,rrdId:9},deps)).status,'week_complete');
 saved=await createSupabaseFinanceIncrementalStateStore().read(account);assert.deepEqual(saved.completedWeeks['2026-09-07:2026-09-13'].publicationEvidence.reportIds,[990003]);
 console.log('AFTER PASS: real fenced RPC pending/restart/cursor retention, later published completion, no migration');
}finally{sql(`DELETE FROM public.marketplace_accounts WHERE id=${account};`);}
