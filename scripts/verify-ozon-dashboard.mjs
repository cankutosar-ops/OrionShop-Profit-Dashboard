import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Next.js resolves server-only at build time. Shim that marker solely in this
// isolated Node test; run the actual service implementation with a fake DB port.
const modelSource=ts.transpileModule(await readFile('src/lib/ozon/catalog-model.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const modelUrl=`data:text/javascript;base64,${Buffer.from(modelSource).toString('base64')}`;
const source = (await readFile('src/services/ozon-dashboard-service.ts', 'utf8'))
  .replace("import 'server-only';", '')
  .replace("'@/lib/ozon/catalog-model'",JSON.stringify(modelUrl));
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { getOzonCaptureStatuses } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
let reads = [];
const makeClient = mode => ({ from(table) {
  assert.ok(['ozon_source_current', 'ozon_source_snapshots'].includes(table));
  const filters = {};
  const finish = async () => {
    reads.push({ table, ...filters });
    assert.equal(filters.marketplace_account_id, '17');
    assert.ok(['products', 'stocks', 'prices'].includes(filters.entity));
    if (mode === 'error') return { error: { message: 'private detail' }, data: null };
    if (mode === 'missing') return { error: null, data: null };
    if (table === 'ozon_source_current') return { error: null, data: { snapshot_id: `fixture-${filters.entity}` } };
    assert.equal(filters.id, `fixture-${filters.entity}`);
    return { error: null, data: { observed_at: '2026-10-02T06:00:00Z', row_count: mode === 'invalid' ? -1 : 14 } };
  };
  const query = { select() { return query; }, eq(key, value) { filters[key] = value; return query; }, maybeSingle: finish, single: finish };
  return query;
} });
for (const [mode, status] of [['stored', 'STORED'], ['missing', 'NOT_CAPTURED'], ['error', 'UNAVAILABLE'], ['invalid', 'UNAVAILABLE']]) {
  reads = [];
  const result = await getOzonCaptureStatuses(makeClient(mode), '17');
  assert.equal(result.length, 3);
  assert.ok(result.every(item => item.status === status));
  assert.equal(JSON.stringify(result).includes('private detail'), false);
  if (mode !== 'stored') assert.ok(result.every(item => item.rowCount === null));
}
console.log('PASS: Ozon DB-only source statuses, account/entity/snapshot constraints and explicit unavailable states');
