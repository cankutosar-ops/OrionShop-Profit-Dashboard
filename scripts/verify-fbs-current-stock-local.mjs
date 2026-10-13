/** Local Docker DB only; synthetic facts, real ACL/RLS helpers, no credentials/WB/production. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const container='supabase_db_OrionShop-Profit-Dashboard';
const database=`orion_fbs_stock_test_${Date.now()}`;
function sql(text,db=database,fails=false) {
  const r=spawnSync('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],{input:text,encoding:'utf8',timeout:30000});
  if(fails)assert.notEqual(r.status,0,'SQL must reject invalid capture');else assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
}
const helpers=sql(`SELECT pg_get_functiondef(p.oid)||';' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='private' AND p.proname='orion_allowed_marketplace_account_ids') OR
(n.nspname='public' AND p.proname IN ('orion_jwt_company_ids','orion_jwt_marketplace_account_ids_claim'))
ORDER BY CASE WHEN n.nspname='private' THEN 1 ELSE 0 END;`,'orionshop_prerelease_20260924');
assert.match(helpers,/app_metadata/);assert.match(helpers,/private.orion_allowed_marketplace_account_ids/);
sql(`CREATE DATABASE ${database};`,'postgres');
sql(`CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(auth.jwt()->>'sub','')::uuid$$;
GRANT USAGE ON SCHEMA auth,private TO authenticated,service_role;
CREATE TABLE marketplace_accounts(id bigint PRIMARY KEY,company_id bigint NOT NULL);
CREATE TABLE products(id bigint PRIMARY KEY,marketplace_account_id bigint NOT NULL);
CREATE TABLE product_variants(id bigint PRIMARY KEY,marketplace_account_id bigint,product_id bigint,chrt_id bigint,tech_size text);
CREATE TABLE wb_seller_warehouses(marketplace_account_id bigint,seller_warehouse_id bigint,delivery_type integer,is_deleting boolean,PRIMARY KEY(marketplace_account_id,seller_warehouse_id));
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO marketplace_accounts VALUES(6,3),(2,4);
INSERT INTO products VALUES(10,6),(11,2);
INSERT INTO product_variants VALUES(1,6,10,1,'M'),(2,6,10,2,'L'),(3,2,11,1,'M');
INSERT INTO wb_seller_warehouses VALUES(6,1910512,1,false),(2,99,1,false);
${helpers}
REVOKE ALL ON FUNCTION private.orion_allowed_marketplace_account_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.orion_allowed_marketplace_account_ids() TO authenticated,service_role;`);
sql(readFileSync(new URL('../supabase/migrations/20261013112007_wb_fbs_current_stock_evidence.sql',import.meta.url),'utf8'));
const quote=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
const now=new Date().toISOString();
const row=(chrt=1,quantity=5)=>({marketplace_account_id:6,seller_warehouse_id:1910512,chrt_id:chrt,product_id:10,warehouse_name:'Kazan',tech_size:chrt===1?'M':'L',sku:null,quantity,observed_at:now});
const set=[row(),row(2,null)];
const put=(rows,account=6)=>`SET ROLE service_role;SELECT replace_wb_fbs_current_stocks(${account},${rows===null?'NULL':quote(rows)});`;
assert.equal(sql(put(set)),'2');assert.equal(sql(put(set)),'2');
const other={...row(),marketplace_account_id:2,seller_warehouse_id:99,product_id:11};
assert.equal(sql(put([other],2)),'1');
const state=()=>sql(`SELECT jsonb_agg(to_jsonb(s) ORDER BY marketplace_account_id,chrt_id) FROM wb_fbs_current_stocks s;`);
const good=state();
for(const bad of [null,[],[row()],[row(),row()],[row(),row(2,-1)],[row(),{...row(2),product_id:11}],[row(),{...row(2),marketplace_account_id:2}],[row(),{...row(2),warehouse_name:null}],set.map(r=>({...r,observed_at:'2020-01-01T00:00:00Z'}))]) {
  sql(put(bad),database,true);assert.equal(state(),good,'rejected capture must preserve both accounts');
}
for(const role of ['anon','authenticated'])sql(`SET ROLE ${role};SELECT replace_wb_fbs_current_stocks(6,${quote(set)});`,database,true);
sql(`SET ROLE authenticated;INSERT INTO wb_fbs_current_stocks SELECT * FROM wb_fbs_current_stocks;`,database,true);
function visible(claims){return sql(`SET request.jwt.claims=${quote(claims).replace('::jsonb','')};SET ROLE authenticated;SELECT coalesce(jsonb_agg(DISTINCT marketplace_account_id),'[]') FROM wb_fbs_current_stocks;`);}
const sub='00000000-0000-0000-0000-000000000001';
assert.equal(visible({sub,app_metadata:{orion:{company_ids:[3]}}}),'[6]');
assert.equal(visible({sub,app_metadata:{orion:{company_ids:[4]}},user_metadata:{orion:{company_ids:[3]}}}),'[2]');
assert.equal(visible({sub,app_metadata:{orion:{company_ids:[3],marketplace_account_ids:[2]}}}),'[]');
assert.equal(visible({}),'[]');
sql(`SET ROLE anon;SELECT * FROM wb_fbs_current_stocks;`,database,true);
assert.equal(sql(`SELECT prosecdef FROM pg_proc WHERE oid='replace_wb_fbs_current_stocks(bigint,jsonb)'::regprocedure;`),'f');
console.log(JSON.stringify({status:'PASS',database,checks:'migration, complete replacement, NULL/partial/duplicate/stale rejection, insert rollback, idempotence, company/account RLS, spoofed user_metadata, service-only writes',productionWrites:0}));
