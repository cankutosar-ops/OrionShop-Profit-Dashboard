import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {encryptOzonCredentials,decryptOzonCredentials,decryptOzonPerformanceCredentials} from '../src/lib/ozon/credentials.ts';
import {captureOzonAccrualDay} from '../src/lib/ozon/accrual-capture.ts';
import {captureOzonSource} from '../src/lib/ozon/capture.ts';
import {resolveConnectionDisplayStatus} from '../src/lib/administration/connection-status.ts';
process.env.MARKETPLACE_CREDENTIALS_KEY='fixture-ozon-connection-key';
globalThis.__ozonTest={encryptOzonCredentials,decryptOzonCredentials,decryptOzonPerformanceCredentials,captureOzonAccrualDay,captureOzonSource};
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
async function load(file,replacements){let source=readFileSync(file,'utf8').replace("import 'server-only';",'');for(const [pattern,replacement] of replacements)source=source.replace(pattern,replacement);return import(`data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`)}
const {connectOzonAccount}=await load('src/services/ozon-connection-service.ts',[
 ["import { createAdminClient } from '@/lib/supabase/admin';",'const createAdminClient=()=>globalThis.__ozonTest.client;'],
 ["import { encryptOzonCredentials, decryptOzonCredentials, decryptOzonPerformanceCredentials, type OzonPerformanceCredentialPair } from '@/lib/ozon/credentials';",'const {encryptOzonCredentials,decryptOzonCredentials,decryptOzonPerformanceCredentials}=globalThis.__ozonTest;'],
 ["import { createOzonReadClient } from '@/lib/ozon/read-client';",'const createOzonReadClient=()=>({readPage:async(...args)=>{globalThis.__ozonTest.readArgs=args;return {items:[]}}});'],
]);
let reserved=null,finalized=null;
const client={from(table){const filters={};let op='';return {select(){return this},eq(k,v){filters[k]=v;return this},async limit(){assert.ok(table.endsWith('_current'));return {error:null}},insert(row){reserved=row;op='insert';return this},update(row){finalized=row;op='update';return this},async single(){return op==='insert'?{data:{id:'17'},error:null}:{data:{id:'17',company_id:'2',marketplace:'ozon',account_name:'Ozon',is_active:true,is_default:false,sync_enabled:true},error:null}}}}};
const input={companyId:'2',accountName:'Ozon',clientId:'12345',apiKey:'fixture-key',client};
const connected=await connectOzonAccount(input);
assert.equal(resolveConnectionDisplayStatus({...connected,sync_lifecycle_status:'NEW_ACCOUNT'}),'connected');
assert.equal(resolveConnectionDisplayStatus({...connected,last_sync_status:'failed'}),'failed');
assert.equal(resolveConnectionDisplayStatus({...connected,marketplace:'wildberries',sync_lifecycle_status:'NEW_ACCOUNT'}),'connecting');
assert.deepEqual(globalThis.__ozonTest.readArgs,['products','',1]);
assert.equal(reserved.is_active,false);assert.equal(reserved.sync_enabled,false);assert.equal(reserved.api_key_encrypted,'');
assert.deepEqual(decryptOzonCredentials(finalized.api_key_encrypted,{accountId:'17',companyId:'2'}),{clientId:'12345',apiKey:'fixture-key'});
assert.equal(connected.automaticSyncEnabled,false);assert.ok(!JSON.stringify(connected).includes('fixture-key'));
let failedReservation=null;
const failedClient={from(table){let op='';return {select(){return this},eq(){return this},async limit(){return {error:null}},insert(row){failedReservation=row;op='insert';return this},update(){op='update';return this},async single(){return op==='insert'?{data:{id:'18'},error:null}:{data:null,error:{message:'fixture_finalize_failure'}}}}}};
await assert.rejects(connectOzonAccount({...input,client:failedClient}),/finalization_failed/);
assert.equal(failedReservation.is_active,false);assert.equal(failedReservation.sync_enabled,false);assert.equal(failedReservation.api_key_encrypted,'');
await assert.rejects(connectOzonAccount({...input,client:{from(){return {select(){return this},async limit(){return {error:{message:'private_schema_failure'}}}}}}}),/schema_not_ready/);
await assert.rejects(connectOzonAccount({...input,clientId:'bad\nheader'}),/invalid/);
const foreignStoreClient={from(table){return {select(){return this},eq(){return this},async limit(){return {error:null}},async single(){return {error:null,data:{id:'17',api_key_encrypted:encryptOzonCredentials({accountId:'17',companyId:'2',clientId:'99999',apiKey:'fixture-other'})}}}}}};
await assert.rejects(connectOzonAccount({...input,accountId:'17',client:foreignStoreClient}),/identity_change_rejected/);
let calls=[];
globalThis.__ozonTest.client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='orion_publish_ozon_fenced_capture'?args.p_capture.accruals.length:true,error:null}}};
globalThis.__ozonTest.readers={createAccrualSession:()=>({readNextPage:async()=>({accruals:[],lastId:'',empty:true})})};
const {runOzonSourceSync}=await load('src/services/ozon-sync-service.ts',[
 ["import { createAdminClient } from '@/lib/supabase/admin';",'const createAdminClient=()=>globalThis.__ozonTest.client;'],
 ["import { loadOzonAccountReaders } from '@/services/ozon-account-readers';",'const loadOzonAccountReaders=async()=>globalThis.__ozonTest.readers;'],
 ["import { captureOzonSource } from '@/lib/ozon/capture';",'const {captureOzonSource}=globalThis.__ozonTest;'],
 ["import { captureOzonAccrualDay } from '@/lib/ozon/accrual-capture';",'const {captureOzonAccrualDay}=globalThis.__ozonTest;'],
]);
const result=await runOzonSourceSync({accountId:'17',companyId:'2',task:'finance',date:'2026-10-05'});
assert.equal(result.status,'NO_ACCRUALS_REPORTED');assert.deepEqual(calls.map(c=>c.name),['orion_acquire_ozon_sync','orion_publish_ozon_fenced_capture','orion_release_ozon_sync']);
assert.equal(calls[0].args.p_token,calls[1].args.p_token);assert.equal(calls[1].args.p_account_id,'17');
calls=[];globalThis.__ozonTest.readers.createAccrualSession=()=>({readNextPage:async()=>{throw new Error('source_failure')}});
await assert.rejects(runOzonSourceSync({accountId:'17',companyId:'2',task:'finance',date:'2026-10-05'}),/source_failure/);
assert.deepEqual(calls.map(c=>c.name),['orion_acquire_ozon_sync','orion_release_ozon_sync']);
calls=[];globalThis.__ozonTest.client={rpc:async(name,args)=>{calls.push({name,args});return {data:false,error:null}}};
await assert.rejects(runOzonSourceSync({accountId:'17',companyId:'2',task:'finance',date:'2026-10-05'}),/busy_or_unavailable/);
assert.deepEqual(calls.map(c=>c.name),['orion_acquire_ozon_sync']);
const wb=readFileSync('src/services/marketplace-account-service.ts','utf8');assert.ok(wb.includes("current.data.marketplace === 'ozon' && input.api_key?.trim()"));
for(const route of ['connect','sync']){const s=readFileSync(`src/app/api/ozon/${route}/route.ts`,'utf8');assert.ok(s.includes('authorize(request'));assert.ok(s.includes('canWriteCompanySettings'));assert.ok(s.includes('isAuthzFailure'))}
delete globalThis.__ozonTest;
console.log('PASS: inert account allocation, scoped encrypted finalization, one-page connection probe, no secret response, no automatic schedule, fenced one-task finance sync, release on failure, no retry, authorized routes and WB credential path protection');
