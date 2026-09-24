import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
function load(path,imports={}){const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',compiled)(id=>{assert.ok(id in imports,id);return imports[id];},m,m.exports);return m.exports;}
const {freshnessItems}=load('src/lib/data-freshness.ts');
const snapshot={dates:{sales:'2026-09-20',orders:'2026-09-20',finance:'2026-09-13',ads:'2026-09-10',inventory:null},finance:{last_error:'awaiting_publication',week_status:'in_progress',active_week_from:'2026-09-14',active_week_to:'2026-09-20'}};
assert.deepEqual(freshnessItems(snapshot,'2026-09-20').map(x=>x.status),['CURRENT','CURRENT','AWAITING PUBLICATION','STALE','INCOMPLETE']);
assert.deepEqual(freshnessItems(snapshot,'2026-09-20').map(x=>x.label),['Sales','Orders','Finance','Ads','Inventory']);
assert.equal(freshnessItems(snapshot,'2026-09-20')[0].latestDate,'2026-09-20');
assert.equal(freshnessItems({...snapshot,finance:null},'2026-09-20')[2].status,'INCOMPLETE');
assert.equal(freshnessItems({...snapshot,finance:{...snapshot.finance,last_error:null}},'2026-09-20')[2].status,'INCOMPLETE');
assert.match(freshnessItems(snapshot,'2026-09-20')[2].detail,/not confirmed/);
assert.match(freshnessItems(snapshot,'2026-09-20')[3].detail,/ends before/);
assert.match(freshnessItems(snapshot,'2026-09-20')[4].detail,/No stored date/);
class NextResponse extends Response{static json(body,init){return new NextResponse(JSON.stringify(body),init);}}
let allowed=false,reads=0;const scoped=[];
const client={from(table){reads++;const q={select(){return q;},eq(column,value){assert.equal(column,table==='marketplace_accounts'?'id':'marketplace_account_id');assert.equal(String(value),'1');scoped.push(table);return q;},order(){return q;},limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:{...snapshot.finance,last_error:'awaiting_publication:private-error'},error:null})};return q;}};
const {GET}=load('src/app/api/data-freshness/route.ts',{
  'next/server':{NextResponse},'@/lib/security/authorize':{authorizeRequestScope:async()=>allowed?{marketplaceAccountId:'1'}:NextResponse.json({}, {status:403}),isAuthzFailure:x=>x instanceof NextResponse},
  '@/lib/supabase/admin':{createAdminClient:()=>client}
});
assert.equal((await GET(new Request('http://local/api/data-freshness?account=2'))).status,403);assert.equal(reads,0);
allowed=true;const response=await GET(new Request('http://local/api/data-freshness?account=1'));const result=await response.json();assert.equal(result.finance.last_error,'awaiting_publication');assert.equal('missingCost' in result,false);assert.equal('products' in result,false);assert.equal(scoped.length,7);assert.equal(response.headers.get('cache-control'),'private, no-store');
assert.doesNotMatch(readFileSync('src/app/api/data-freshness/route.ts','utf8'),/\.insert\(|\.update\(|\.upsert\(|\.delete\(|sync-job-service|WbApiClient/);
const page=readFileSync('src/app/page.tsx','utf8');
const panel=readFileSync('src/components/dashboard/sync-verification-panel.tsx','utf8');
assert.doesNotMatch(page,/DataFreshnessNotice|data-freshness-notice/);
assert.match(panel,/Data Status/);assert.match(panel,/AWAITING_WB_PUBLICATION/);assert.match(panel,/w-\[calc\(100vw-1\.5rem\)\]/);
assert.doesNotMatch(panel,/Product Cost|\/api\/sync\/verification/);
console.log('PASS five-source freshness states, compact responsive Data Status control, authorization-before-read, all seven account predicates, redaction, no-store and no ingestion');
