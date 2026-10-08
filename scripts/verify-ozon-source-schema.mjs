// Embedded PostgreSQL rehearsal. Requires the isolated development dependency:
// npm install --prefix .audit/ozon-local-postgres --no-audit --no-fund @electric-sql/pglite
// Does not connect to Supabase or any external database.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '../.audit/ozon-local-postgres/node_modules/@electric-sql/pglite/dist/index.js';

const dir = `.audit/ozon-schema-${randomUUID()}`;
await mkdir(dir, { recursive: true });
let db = new PGlite(dir);
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA private;
  CREATE TABLE public.marketplace_accounts(id bigint PRIMARY KEY, marketplace text, is_active boolean);
  INSERT INTO public.marketplace_accounts VALUES(1,'ozon',true),(2,'ozon',true),(3,'wb',true);
  GRANT SELECT, UPDATE ON public.marketplace_accounts TO service_role;
  CREATE FUNCTION private.orion_allowed_marketplace_account_ids() RETURNS bigint[] LANGUAGE sql AS
  $$ SELECT coalesce(nullif(current_setting('test.account_ids',true),''),'{}')::bigint[] $$;
  GRANT USAGE ON SCHEMA private TO authenticated;
  GRANT EXECUTE ON FUNCTION private.orion_allowed_marketplace_account_ids() TO authenticated;`);
await db.exec(await readFile('supabase/migrations/20261002064725_ozon_source_capture_foundation.sql', 'utf8'));
const id = randomUUID();
const source = [{ product_id: 11, stocks: [{ warehouse_id: 1, sku: 91 }, { warehouse_id: 2, sku: 92 }] }];
const publish = (account, snapshot, date, items = source) => db.query(
  'SELECT public.orion_publish_ozon_source_capture($1,$2,$3,$4,$5) AS n',
  [account, 'stocks', snapshot, date, JSON.stringify(items)]);
await db.exec('SET ROLE service_role');
assert.equal((await publish(1, id, '2026-10-01')).rows[0].n, 1);
assert.equal((await publish(1, id, '2026-10-01')).rows[0].n, 1);
const newer = randomUUID();
await publish(1, newer, '2026-10-02');
await publish(1, id, '2026-10-01'); // Replay cannot roll pointer backwards.
await publish(2, randomUUID(), '2026-10-01');
await assert.rejects(publish(3, randomUUID(), '2026-10-02'), /invalid_ozon_account/);
await assert.rejects(publish(2, id, '2026-10-01'), /identity_conflict/);
await assert.rejects(publish(1, randomUUID(), '2026-09-30'), /stale/);
await assert.rejects(publish(1, randomUUID(), '2026-10-03', [source[0], source[0]]), /identity/);
await assert.rejects(db.query('DELETE FROM public.ozon_source_snapshots'), /permission denied/);
assert.equal((await db.query('SELECT snapshot_id FROM public.ozon_source_current WHERE marketplace_account_id=1')).rows[0].snapshot_id, newer);
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ozon_source_snapshots')).rows[0].n, 3);
await db.exec("RESET ROLE; SET ROLE authenticated; SET test.account_ids='{1}';");
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ozon_source_snapshots')).rows[0].n, 2);
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ozon_source_current')).rows[0].n, 1);
await assert.rejects(publish(1, randomUUID(), '2026-10-03'), /permission denied/);
await assert.rejects(db.query('DELETE FROM public.ozon_source_current'), /permission denied/);
await db.exec("RESET ROLE; SET ROLE anon;");
await assert.rejects(db.query('SELECT * FROM public.ozon_source_snapshots'), /permission denied/);
await db.exec('RESET ROLE');
await db.close();
db = new PGlite(dir);
const stored = await db.query('SELECT items FROM public.ozon_source_snapshots WHERE id=$1', [id]);
assert.deepEqual(stored.rows[0].items, source);
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ozon_source_snapshots')).rows[0].n, 3);
await db.close();
console.log('PASS: actual migration, atomic publication, replay/stale rejection, dimensions, RLS, immutable grants and restart persistence');
console.log('Coverage: embedded PostgreSQL with minimal authorization fixture; full Supabase rehearsal still required.');
