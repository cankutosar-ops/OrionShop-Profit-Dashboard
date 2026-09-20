import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
function load(path,imports={}){const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',compiled)(id=>{assert.ok(id in imports,id);return imports[id];},m,m.exports);return m.exports;}
const {freshnessItems}=load('src/lib/data-freshness.ts');
const snapshot={dates:{sales:'2026-09-20',orders:'2026-09-20',finance:'2026-09-13',ads:'2026-09-10',inventory:null},finance:{last_error:'awaiting_publication',week_status:'in_progress',active_week_from:'2026-09-14',active_week_to:'2026-09-20'},missingCost:42,products:91};
assert.deepEqual(freshnessItems(snapshot,'2026-09-20').map(x=>x.status),['CURRENT','CURRENT','AWAITING PUBLICATION','STALE','INCOMPLETE','MISSING COST']);
assert.equal(freshnessItems({...snapshot,finance:null},'2026-09-20')[2].status,'INCOMPLETE');
assert.equal(freshnessItems({...snapshot,finance:{...snapshot.finance,last_error:null}},'2026-09-20')[2].status,'INCOMPLETE');
assert.match(freshnessItems(snapshot,'2026-09-20')[2].detail,/not confirmed/);
class NextResponse extends Response{static json(body,init){return new NextResponse(JSON.stringify(body),init);}}
let allowed=false,reads=0;const scoped=[];
const client={from(table){reads++;const q={select(){return q;},eq(column,value){assert.equal(column,table==='marketplace_accounts'?'id':'marketplace_account_id');assert.equal(String(value),'1');scoped.push(table);return q;},order(){return q;},limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:{...snapshot.finance,last_error:'awaiting_publication:private-error'},error:null})};return q;}};
const {GET}=load('src/app/api/data-freshness/route.ts',{
  'next/server':{NextResponse},'@/lib/security/authorize':{authorizeRequestScope:async()=>allowed?{marketplaceAccountId:'1'}:NextResponse.json({}, {status:403}),isAuthzFailure:x=>x instanceof NextResponse},
  '@/lib/supabase/admin':{createAdminClient:()=>client},'@/services/persisted-query-service':{fetchProductsWithRelations:async id=>{assert.equal(id,'1');return[{id:'11'},{id:'12'}];},fetchCostHistory:async(id,c,options)=>{assert.equal(id,'1');assert.deepEqual(options.productIds,['11','12']);return[{product_id:'11',cost:0,effective_from:'2000-01-01',effective_to:null}];}}
});
assert.equal((await GET(new Request('http://local/api/data-freshness?account=2'))).status,403);assert.equal(reads,0);
allowed=true;const response=await GET(new Request('http://local/api/data-freshness?account=1'));const result=await response.json();assert.equal(result.missingCost,1);assert.equal(result.finance.last_error,'awaiting_publication');assert.equal(scoped.length,7);assert.equal(response.headers.get('cache-control'),'private, no-store');
assert.doesNotMatch(readFileSync('src/app/api/data-freshness/route.ts','utf8'),/\.insert\(|\.update\(|\.upsert\(|\.delete\(|sync-job-service|WbApiClient/);
console.log('PASS freshness states, valid zero cost, missing cost, authorization-before-read, all seven account predicates, redaction, no-store and no ingestion');
