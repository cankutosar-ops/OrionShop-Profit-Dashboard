/** Local restored clone only. No credentials, WB calls, or production connection. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const container='supabase_db_OrionShop-Profit-Dashboard';
const database='orionshop_comment_rehearsal_20260920_final';
const migration='20260920095101_restore_historical_column_comments.sql';
const versions=['20260624120000','20260712180000','20260712200000','20260720170000','20260726160000','20260731120000','20260909110000'];
const corrected=new Set(['20260624120000','20260712180000','20260726160000']);
const sqlText=readFileSync(`supabase/migrations/${migration}`,'utf8');
const pattern=/COMMENT ON COLUMN (public\.\w+\.\w+) IS\s*'((?:[^']|'')*)';/g;
const expected=versions.flatMap(version=>{
  const file=readdirSync('supabase/migrations').find(f=>f.startsWith(version+'_'));
  return [...readFileSync(`supabase/migrations/${file}`,'utf8').matchAll(pattern)]
    .map(m=>({column:m[1],comment:m[2].replaceAll("''","'"),statement:m[0],version}));
});
const five=expected.filter(x=>corrected.has(x.version));
assert.equal(five.length,5);
assert.deepEqual([...sqlText.matchAll(pattern)].map(m=>[m[1],m[2].replaceAll("''","'")]),five.map(x=>[x.column,x.comment]));
assert.equal(sqlText.replace(/^--.*$/gm,'').replace(pattern,'').replace(/\b(BEGIN|COMMIT);/g,'').trim(),'','only five comments plus transaction delimiters');
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024});assert.equal(r.status,0,(r.stderr||'Local Docker error').slice(0,1000));return r.stdout.trim();}
function query(q){return docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],q);}
function json(q){return JSON.parse(query(q));}
function catalog(){return docker(['exec',container,'pg_dump','-U','postgres','-d',database,'--schema-only','--schema=public','--no-comments'])
  .split(/\r?\n/).filter(line=>!/^\\(un)?restrict\b/.test(line)).join('\n');}
function comments(){return json(`SELECT coalesce(jsonb_object_agg('public.'||c.relname||'.'||a.attname,col_description(c.oid,a.attnum)),'{}')
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m');`);}
function fingerprints(){const tables=json("SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public';");
  return Object.fromEntries(tables.map(table=>[table,json(`SELECT json_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),''))) FROM public."${table.replaceAll('"','""')}" t;`)]));}
const beforeComments=comments();for(const x of five)assert.equal(beforeComments[x.column],null,`precondition: ${x.column} absent`);
const beforeCatalog=catalog(),beforeRows=fingerprints();
query(sqlText);
const afterComments=comments(),afterCatalog=catalog(),afterRows=fingerprints();
const expectedComments={...beforeComments};for(const x of five)expectedComments[x.column]=x.comment;
assert.deepEqual(afterComments,expectedComments,'exactly five comment changes');
assert.equal(afterCatalog,beforeCatalog,'types/defaults/nullability/indexes/constraints/RLS/grants/functions/triggers unchanged');
assert.deepEqual(afterRows,beforeRows,'all public business rows byte-equivalent');
for(const x of expected)assert.equal(afterComments[x.column],x.comment,`${x.version}: exact enduring comment`);
const columns=json(`SELECT jsonb_object_agg(c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)))
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped;`);
for(const x of expected){const key=x.column.slice(7),numeric=/price_with_disc|for_pay/.test(key),transit=/in_way_/.test(key);
  assert.deepEqual(columns[key],{type:numeric?'numeric(12,2)':transit?'integer':key.endsWith('last_change_date')?'date':'text',notnull:numeric||transit,default:numeric||transit?'0':null},key);}
const indexes=json("SELECT jsonb_object_agg(indexname,indexdef) FROM pg_indexes WHERE schemaname='public';");
for(const [name,definition]of Object.entries({
  idx_wb_finance_srid:'CREATE INDEX idx_wb_finance_srid ON public.wb_finance USING btree (srid) WHERE (srid IS NOT NULL)',
  idx_wb_orders_last_change_date:'CREATE INDEX idx_wb_orders_last_change_date ON public.wb_orders USING btree (last_change_date)',
  idx_wb_sales_warehouse:'CREATE INDEX idx_wb_sales_warehouse ON public.wb_sales USING btree (warehouse) WHERE (warehouse IS NOT NULL)',
  idx_wb_ads_account_source_key_atomic:'CREATE UNIQUE INDEX idx_wb_ads_account_source_key_atomic ON public.wb_ads USING btree (marketplace_account_id, source_key)',
}))assert.equal(indexes[name],definition,name);
query(sqlText);assert.deepEqual(comments(),afterComments,'idempotent reapply');assert.equal(catalog(),afterCatalog);
assert.deepEqual(fingerprints(),afterRows);
mkdirSync('.audit',{recursive:true});
writeFileSync('.audit/comment-correction-rehearsal.json',JSON.stringify({migration,sha256:createHash('sha256').update(sqlText).digest('hex'),
  checkedAt:new Date().toISOString(),beforeFiveAbsent:true,exactComments:5,publicTablesVerified:Object.keys(beforeRows).length,
  fullSchemaExceptCommentsUnchanged:true,allPublicDataFingerprintsUnchanged:true,reapplyIdempotent:true,
  currentStateEquivalentCandidates:versions,historyExecutionProven:false},null,2));
console.log(`PASS: five exact comments; ${Object.keys(beforeRows).length} public tables unchanged by counts/content fingerprints; full schema unchanged; seven current-state contracts equivalent; idempotent reapply.`);
