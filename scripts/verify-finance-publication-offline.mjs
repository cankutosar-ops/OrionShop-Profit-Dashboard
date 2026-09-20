import assert from 'node:assert/strict';
import { publicationCoverage } from '../src/lib/finance-incremental/publication.ts';
import { emptyFinanceIncrementalState } from '../src/lib/finance-incremental/week-planner.ts';
import { createMemoryFinanceIncrementalStateStore } from '../src/lib/finance-incremental/state.ts';
import { runFinanceReportsV1PageWake } from '../src/lib/finance-incremental/page-wake.ts';
import { runFinanceCatchupWorkerTask } from '../src/worker/tasks/finance-catchup-task.ts';
globalThis.fetch=async()=>{throw Error('Network forbidden');};
let now=Date.parse('2026-09-20T12:00:00Z');
const week={from:'2026-09-07',to:'2026-09-13',key:'2026-09-07:2026-09-13'};
const snapshot={marketplace_account_id:1,marketplace_type:'wildberries',report_id:101,date_from:week.from,date_to:week.to,create_date:'2026-09-14',observed_at:'2026-09-19T12:00:00Z',meta:{source:'wb_sales_reports_list'}};
const coverage=(rows)=>publicationCoverage('1',week,new Date(now).toISOString(),rows);
assert.ok(coverage([snapshot]));
for(const rows of [[],[{...snapshot,marketplace_account_id:2}],[{...snapshot,meta:{source:'204'}}],[{...snapshot,date_to:'2026-09-12'}],[{...snapshot,observed_at:'2026-09-21T00:00:00Z'}],[{...snapshot,date_from:'2026-02-30'}]])assert.equal(coverage(rows),null);
assert.ok(coverage([{...snapshot,date_to:'2026-09-09'},{...snapshot,report_id:102,date_from:'2026-09-10'}]));
assert.equal(coverage([{...snapshot,date_to:'2026-09-09'},{...snapshot,report_id:102,date_from:'2026-09-11'}]),null,'coverage holes rejected');
const terminal={kind:'terminal',httpStatus:204,apiRows:0,persistedLines:0,hasMore:false,isEmpty:true,nextRrdId:null,reportIds:[],returnedFrom:null,returnedTo:null,errors:[],remaining:0,limit:1,resetSeconds:null,retrySeconds:null};
const data={...terminal,kind:'data',httpStatus:200,apiRows:1,persistedLines:12,hasMore:true,isEmpty:false,nextRrdId:9};
const seed=id=>({...emptyFinanceIncrementalState(id),updatedAt:'2026-09-20T12:00:00Z',completedWeeks:{'2026-08-31:2026-09-06':{from:'2026-08-31',to:'2026-09-06',completedAt:'2026-09-14T00:00:00Z'}}});
function setup(){const store=createMemoryFinanceIncrementalStateStore({'1':seed('1'),'2':seed('2')},()=>now);let published=false;
 const deps={loadAccount:async id=>({id,sellerId:null,apiKey:'fixture'}),readState:id=>store.read(id),acquireLease:(id,o)=>store.acquireLease(id,o),renewLease:(id,o)=>store.renewLease(id,o),commitLease:(s,o,r)=>store.commitLease(s,o,r),assertLiveAllowed(){},assertTokenReady(){},readPublicationEvidence:async(id,w,before)=>published?publicationCoverage(id,w,before,[snapshot]):null,syncPage:async()=>terminal};
 const run=async(page=terminal)=>{now+=71000;deps.syncPage=async()=>page;const s=await store.read('1');return runFinanceReportsV1PageWake({accountId:'1',weekFrom:week.from,weekTo:week.to,rrdId:s.lastPersistedRrdId,mode:'current_week',nowMs:now,today:'2026-09-20'},deps);};return{store,deps,run,publish:()=>published=true};}
for(const persisted of [false,true])for(const published of [false,true]){
 const x=setup();if(persisted){assert.equal((await x.run(data)).status,'wake_ok');assert.equal((await x.store.read('1')).lastPersistedRrdId,9);}if(published)x.publish();
 const r=await x.run(),s=await x.store.read('1');assert.equal(r.status,published?'week_complete':'awaiting_publication');
 assert.equal(Boolean(s.completedWeeks[week.key]),published);assert.equal(s.lockOwner,null);assert.deepEqual(s.completedWeeks['2026-08-31:2026-09-06'],seed('1').completedWeeks['2026-08-31:2026-09-06']);assert.deepEqual(await x.store.read('2'),seed('2'));
 if(!published){assert.equal(s.lastPersistedRrdId,persisted?9:0);assert.equal(s.weekStatus,'in_progress');x.publish();assert.equal((await x.run()).status,'week_complete');}
}
for(const status of [401,403,429,500]){const x=setup();await x.run(data);const r=await x.run({...terminal,kind:'failure',httpStatus:status,errors:[`[http ${status}]`]});assert.equal(r.status,status===429?'rate_limited':'failed');assert.equal((await x.store.read('1')).lastPersistedRrdId,9);assert.ok(!(await x.store.read('1')).completedWeeks[week.key]);}
for(const failure of [{...data,nextRrdId:0},{...data,kind:'failure',errors:['persistence failed'],persistedLines:0}]){const x=setup();const r=await x.run(failure);assert.equal(r.status,'failed');assert.equal((await x.store.read('1')).lastPersistedRrdId,0);}
{const x=setup();x.publish();let commits=0;const commit=x.deps.commitLease;x.deps.commitLease=(...args)=>++commits===2?Promise.resolve(false):commit(...args);assert.equal((await x.run()).error,'lease_lost');assert.ok(!(await x.store.read('1')).completedWeeks[week.key]);}
{const x=setup();x.deps.readPublicationEvidence=async()=>{throw Error('offline DB failure');};assert.equal((await x.run()).status,'awaiting_publication');assert.equal((await x.store.read('1')).lastError,'awaiting_publication:evidence_unavailable');}
console.log('PASS publication A–M: zero/nonzero cursor, partial/complete coverage, retry eligibility, HTTP errors, malformed/persistence failure, lease loss, account/history isolation');
let wakes=0;const worker=await runFinanceCatchupWorkerTask({accountIds:['1'],deadlineMs:Date.now()+10000,maxWakesPerAccount:4,
 logger:{info(){},error(){},warn(){},log(){}},deps:{listAccounts:async()=>[{id:'1',accountName:'fixture'}],readCursor:async()=>({rrdId:9,blockedUntil:null}),runWake:async()=>{wakes++;return{status:'awaiting_publication',error:'awaiting_publication',persistedRows:0,responseRows:0,httpStatus:204,cursorBefore:9,cursorAfter:9,cursorAdvancedBeforePersist:false,retryPerformed:false};}}});
assert.equal(wakes,1);assert.equal(worker[0].outcome,'skipped');assert.match(worker[0].detail,/awaiting_publication/);
console.log('PASS worker stops after one pending wake; no retry loop or success claim');
