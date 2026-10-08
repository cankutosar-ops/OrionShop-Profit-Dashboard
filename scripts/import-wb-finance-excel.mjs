// Controlled one-shot Excel import. Dry-run by default; no WB API calls.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const args=process.argv.slice(2),apply=args.includes('--apply');
const option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const path=option('--plan');if(!path)throw Error('Provide --plan');
const bytes=readFileSync(path),sha=createHash('sha256').update(bytes).digest('hex');
const plan=JSON.parse(bytes);if(plan.accountId!==6||plan.companyId!==3||plan.plans?.length!==115||plan.sourceRows!==42419)throw Error('Unapproved import scope');
if(!apply){console.log(JSON.stringify({mode:'dry-run',account:6,company:3,reports:115,sourceRows:42419,financeLines:plan.plans.reduce((n,p)=>n+p.lines.length,0),planSha256:sha,productionWrites:0}));process.exit(0);}
if(option('--approved-plan-sha')!==sha)throw Error('Explicit approved plan SHA required');
for(const file of ['.env.local','.env'])if(existsSync(file))for(const line of readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);if(m)process.env[m[1]]??=m[2].replace(/^(['"])(.*)\1$/,'$2');}
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Server credentials unavailable');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(60000)})}});
const owner=`excel-import:${randomUUID()}`;let leased=null;
function check(result,stage){if(result.error)throw Error(`${stage}: ${result.error.code||'database_error'}`);return result.data;}
const account=check(await db.from('marketplace_accounts_public').select('id,company_id,account_name,marketplace').eq('id',6).single(),'account_preflight');
if(Number(account.company_id)!==3||account.account_name!=='Günay'||account.marketplace!=='wildberries')throw Error('Account mapping changed');
check(await db.from('wb_finance_excel_imports').select('report_id').eq('marketplace_account_id',6),'migration_preflight');
const outcome={accountId:6,companyId:3,reports:[],planSha256:sha,status:'running'};
try {
 leased=check(await db.rpc('orion_finance_incremental_acquire_lease',{p_account_id:6,p_owner:owner}),'acquire_lease');if(!leased)throw Error('FINANCE_LEASE_BUSY');
 const foreign=check(await db.from('wb_finance').select('id').eq('marketplace_account_id',6).not('source_key','like','xlsx:%').limit(1),'source_overlap_preflight');if(foreign.length)throw Error('Account contains non-Excel Finance; reconciliation required');
 for(const p of plan.plans){
  const persisted=check(await db.rpc('orion_import_wb_finance_excel_report',{p_account_id:6,p_owner:owner,p_report:p.report,p_lines:p.lines}),'atomic_report');
  if(persisted!==0&&persisted!==p.lines.length)throw Error('Unexpected persisted count');
  outcome.reports.push({reportId:p.report.reportId,expected:p.lines.length,inserted:persisted});
  writeFileSync('.audit/gunay-production-import-progress.json',JSON.stringify(outcome,null,2));
 }
 const result=await db.from('wb_finance').select('id',{count:'exact',head:true}).eq('marketplace_account_id',6).like('source_key','xlsx:%');check(result,'final_count');
 if(result.count!==plan.plans.reduce((n,p)=>n+p.lines.length,0))throw Error('Final row count mismatch');
 outcome.status='complete';outcome.persistedRows=result.count;
} catch(error){outcome.status='stopped';outcome.reason=error instanceof Error?error.message:'unknown';throw error;}
finally {
 if(leased){const released=await db.rpc('orion_finance_incremental_commit_lease',{p_account_id:6,p_owner:owner,p_state:leased,p_release:true});outcome.leaseReleased=!released.error&&released.data===true;}
 writeFileSync('.audit/gunay-production-import-progress.json',JSON.stringify(outcome,null,2));
}
console.log(JSON.stringify({status:outcome.status,account:6,reports:outcome.reports.length,rows:outcome.persistedRows,leaseReleased:outcome.leaseReleased}));
