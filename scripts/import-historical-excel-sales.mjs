import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
// Explicit operator tool. No dotenv loading, no API fetches, no automatic retries.
const args=process.argv.slice(2);const value=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const path=value('--plan');if(!path)throw Error('Provide --plan and --expected-sha256; default is dry run');
const bytes=readFileSync(path),hash=createHash('sha256').update(bytes).digest('hex');
assert.equal(hash,value('--expected-sha256'),'Plan checksum must match approved plan');
const plan=JSON.parse(bytes.toString('utf8'));assert.equal(plan.account,6);assert.equal(plan.eventCount,4533);assert.equal(plan.cutoff,'2026-07-14');
assert.equal(plan.reports.reduce((n,r)=>n+r.events.length,0),4533);
for(const report of plan.reports)for(const row of report.events){assert.equal(row.marketplace_account_id,'6');assert.equal(row.report_id,report.reportId);assert.ok(row.sale_date<'2026-07-14');}
console.log(JSON.stringify({mode:args.includes('--apply')?'apply':'dry-run',account:6,reports:plan.reports.length,events:4533,sha256:hash}));
if(!args.includes('--apply'))process.exit(0);
assert.ok(args.includes('--writers-quiesced'),'Confirm external writers are quiesced before apply');
const receipt=JSON.parse(readFileSync(value('--backup-receipt'),'utf8'));
assert.equal(receipt.restoreVerified,true);assert.match(receipt.sha256,/^[a-f0-9]{64}$/);assert.ok(Date.now()-Date.parse(receipt.timestamp)>=0&&Date.now()-Date.parse(receipt.timestamp)<3600000,'A fresh restore-verified backup is required');
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;assert.ok(url&&key,'Server-only credentials required');
const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const rpc=async(name,p)=>{const {data,error}=await sb.rpc(name,p);if(error)throw Error(name+': '+error.message);return data};
const owner='excel-sales-'+randomUUID();
const state=await rpc('orion_finance_incremental_acquire_lease',{p_account_id:6,p_owner:owner});assert.ok(state,'Finance lease busy; stop');
try{
 for(const report of plan.reports){assert.equal(await rpc('orion_finance_incremental_renew_lease',{p_account_id:6,p_owner:owner}),true);await rpc('orion_import_wb_excel_sales',{p_account_id:6,p_owner:owner,p_report_id:report.reportId,p_rows:report.events});}
 const {data:manifest,error}=await sb.from('wb_excel_sales_imports').select('report_id,payload_hash,event_count').eq('marketplace_account_id',6).order('report_id');if(error)throw error;
 assert.equal(manifest.length,87);assert.equal(manifest.reduce((n,r)=>n+r.event_count,0),4533);
 await rpc('orion_complete_wb_excel_sales',{p_account_id:6,p_owner:owner,p_manifest:manifest});
 console.log('Campaign completed; perform independent business-data reconciliation before release');
}finally{
 assert.equal(await rpc('orion_finance_incremental_commit_lease',{p_account_id:6,p_owner:owner,p_state:state,p_release:true}),true,'Lease release failed; stop');
}
