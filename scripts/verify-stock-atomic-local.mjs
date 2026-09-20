/** Local Docker only. Synthetic fixtures; never reads credentials or calls WB. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
const container = 'supabase_db_OrionShop-Profit-Dashboard';
const database = 'orionshop_rc_20260920';
const args = ['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database];
function sql(text, fails=false) {
  const r=spawnSync('docker',args,{input:text,encoding:'utf8',timeout:30000});
  if (fails) assert.notEqual(r.status,0,'expected SQL failure');
  else assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
}
const quote = value => `'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const a=990001,b=990002,day='2099-01-01';
const row=(account=a,date=day,quantity=10,size='M')=>({marketplace_account_id:account,snapshot_date:date,
  warehouse_name:'Synthetic North',nm_id:990001,size,barcode:`TEST-${size}`,seller_article:'synthetic',
  brand:'',subject:'',quantity,in_way_to_client:0,in_way_from_client:0});
const snap=(rows,account=a,date=day)=>`SELECT public.replace_inventory_snapshot_day(${account},'${date}',${quote(rows)});`;
const state=()=>sql(`SELECT coalesce(jsonb_agg(to_jsonb(s)-'id'-'created_at' ORDER BY marketplace_account_id,snapshot_date,warehouse_name,size),'[]') FROM public.historical_inventory_snapshots s WHERE marketplace_account_id IN (${a},${b});`);
const stock=(account=a,quantity=10,chrt=990001)=>({marketplace_account_id:account,nm_id:990001,chrt_id:chrt,
  warehouse_key:'id:990001',warehouse_id:990001,warehouse_name:'Synthetic North',quantity,
  in_way_to_client:0,in_way_from_client:0,barcode:null,tech_size:null,observed_at:'2099-01-01T00:00:00Z'});
const canonical=(rows,account=a)=>`SELECT public.replace_wb_current_stocks_verified(${account},${quote(rows)});`;
const current=()=>sql(`SELECT jsonb_agg(to_jsonb(s) ORDER BY marketplace_account_id,chrt_id) FROM public.wb_current_stocks s WHERE marketplace_account_id IN (${a},${b});`);
assert.equal(sql(`SELECT count(*) FROM public.marketplace_accounts WHERE id IN (${a},${b});`),'0','fixture IDs must be unused');
sql(`INSERT INTO public.marketplace_accounts(id,company_id,marketplace,account_name,is_active)
 SELECT n, (SELECT min(id) FROM public.companies),'wildberries','LOCAL SYNTHETIC ATOMIC TEST',false FROM unnest(ARRAY[${a},${b}]) n;`);
try {
  sql(snap([row()])); sql(snap([row(b)],b));sql(snap([row(a,'2099-01-02')],a,'2099-01-02'));
  const replacement=[row(a,day,20),row(a,day,30,'L')];
  assert.equal(sql(`SET ROLE service_role;${snap(replacement)}`),'2');
  const good=state();assert.equal(JSON.parse(good).length,4);
  sql(snap(replacement));assert.equal(state(),good,'idempotent business state');
  for (const invalid of [[],[{}],[row(b)],[row(a,'2099-01-03')],[row(a,day,-1)]]) {
    sql(snap(invalid),true);assert.equal(state(),good,'invalid/empty/cross-scope retains all days/accounts');
  }
  // Unique violation occurs during INSERT, after DELETE has executed.
  sql(snap([row(),row()]),true);assert.equal(state(),good,'insert failure rolls back delete');
  for (const role of ['anon','authenticated']) {
    sql(`SET ROLE ${role};${snap(replacement)}`,true);assert.equal(state(),good);
    sql(`SET ROLE ${role};${canonical([stock()])}`,true);
  }
  // Hold the successful writer transaction open. The second writer must wait
  // on the DB lock, then fail during INSERT without erasing the committed first.
  const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='',errors='';
  p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>errors+=d);
  const done=new Promise(resolve=>p.on('exit',resolve));
  p.stdin.write(`BEGIN;${snap([row(a,day,77)])}SELECT 'writer_ready';\n`);
  for(let i=0;!output.includes('writer_ready')&&i<100;i++) await new Promise(r=>setTimeout(r,50));
  assert.match(output,/writer_ready/,errors);
  const second=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let secondError='';
  second.stderr.on('data',d=>secondError+=d);
  const secondDone=new Promise(resolve=>second.on('exit',resolve));
  second.stdin.end(snap([row(),row()]));
  let waiting=false;
  for(let i=0;i<40;i++) {
    waiting=Number(sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory';"))>0;
    if(waiting)break;await new Promise(r=>setTimeout(r,50));
  }
  assert.ok(waiting,'second writer demonstrably waits for database lock');
  p.stdin.end('COMMIT;');assert.equal(await done,0,errors);
  assert.notEqual(await secondDone,0);assert.match(secondError,/duplicate key/);
  assert.equal(JSON.parse(state()).find(r=>r.marketplace_account_id===a&&r.snapshot_date===day).quantity,77);
  assert.equal(JSON.parse(state()).length,3,'no partial snapshot, other account/day retained');
  const completeSets=[[row(a,day,41),row(a,day,42,'L')],[row(a,day,51,'XL')]];
  const successfulWriters=completeSets.map(rows=>new Promise(resolve=>{
    const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
    let err='';child.stderr.on('data',d=>err+=d);
    child.on('exit',code=>resolve({code,err}));child.stdin.end(snap(rows));
  }));
  for(const result of await Promise.all(successfulWriters)) assert.equal(result.code,0,result.err);
  const finalRows=JSON.parse(state()).filter(r=>r.marketplace_account_id===a&&r.snapshot_date===day);
  assert.ok((finalRows.length===2&&finalRows.every(r=>[41,42].includes(r.quantity)))||
    (finalRows.length===1&&finalRows[0].quantity===51),'two successful writers yield one whole set, never a union/partial');
  const history=state();
  sql(canonical([stock(),stock(a,11,990002)]));sql(canonical([stock(b)],b));
  const before=current();
  for(const invalid of [[],[stock(b)],[stock(),stock(a,-1,990003)]]) {
    sql(canonical(invalid),true);assert.equal(current(),before,'canonical failure rollback and account isolation');
  }
  sql(canonical([stock(a,33)]));assert.equal(JSON.parse(current()).length,2);
  const aggregate={...stock(),warehouse_id:-999999,warehouse_key:'id:-999999',warehouse_name:'Склад WB'};
  const otherAccount=JSON.parse(current()).filter(r=>r.marketplace_account_id===b);
  sql(canonical([aggregate,stock()]));
  const aggregateState=current();
  assert.equal(JSON.parse(aggregateState).filter(r=>r.marketplace_account_id===a).length,2);
  assert.equal(JSON.parse(aggregateState).find(r=>r.warehouse_id===-999999).warehouse_key,'id:-999999');
  assert.deepEqual(JSON.parse(aggregateState).filter(r=>r.marketplace_account_id===b),otherAccount);
  sql(canonical([aggregate,aggregate]),true);assert.equal(current(),aggregateState,'aggregate duplicate rolls back');
  const businessState=value=>JSON.parse(value).map(({updated_at,...r})=>r)
    .sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));
  sql(canonical([aggregate,stock()]));assert.deepEqual(businessState(current()),businessState(aggregateState),'aggregate re-sync idempotent');
  assert.equal(state(),history,'canonical cannot mutate historical snapshots');
  assert.equal(sql(`SELECT count(*) FROM public.wb_stock WHERE marketplace_account_id IN (${a},${b});`),'0','legacy untouched');
  console.log('PASS: local atomic replacement, forced insert rollback, real lock contention, idempotence, service-only ACL, scope isolation, canonical rollback/history preservation');
} finally {
  sql(`DELETE FROM public.wb_current_stocks WHERE marketplace_account_id IN (${a},${b});
    DELETE FROM public.marketplace_accounts WHERE id IN (${a},${b});`);
}
