import assert from 'node:assert/strict';
import { captureOzonSource } from '../src/lib/ozon/capture.ts';

const items = [{ product_id: 41, stocks: [{ warehouse_ids: [1, 2], sku: 91, present: 2, reserved: 1, type: 'fbo', shipment_type: 'fixture' },
  { warehouse_ids: [3], sku: 92, present: 3, reserved: 0, type: 'fbs', shipment_type: 'fixture' }] }, { product_id: 42 }];
const page = (rows, cursor = '') => ({ entity: 'stocks', items: rows,
  nextCursor: cursor, exhausted: rows.length === 0 });
let writes = [];
const run = (pages, options = {}) => {
  let index = 0;
  return captureOzonSource({ accountId: '3', entity: 'stocks',
    readPage: async () => {
      const value = pages[index++];
      if (value instanceof Error) throw value;
      assert.ok(value, 'unexpected additional request');
      return value;
    }, publish: async value => { writes.push(value); return value.items.length; }, ...options });
};
const result = await run([page(items, 'next'), page([])]);
assert.equal(result.rowsPersisted, 2);
assert.equal(writes.length, 1);
assert.deepEqual(writes[0].items, items);
assert.equal(writes[0].accountId, '3');
assert.equal(writes[0].items[0].stocks.length, 2);
for (const [pages, options, reason] of [
  [[page(items, 'next'), new Error('transport_failure')], {}, /transport_failure/],
  [[page(items, 'next')], { maxPages: 1 }, /page_budget/],
  [[page(items, 'next'), page(items, 'other')], {}, /duplicate/],
  [[page(items, 'next'), page([{ product_id: 44 }], 'next')], {}, /cursor/],
  [[page([])], {}, /empty_capture/],
  [[page([{ product_id: 0 }], 'next')], {}, /identity/],
]) {
  writes = [];
  await assert.rejects(run(pages, options), reason);
  assert.equal(writes.length, 0, 'failed capture must not publish');
}
writes = [];
await run([page([])], { allowEmpty: true });
assert.equal(writes.length, 1);
await assert.rejects(run([page([])], { accountId: '0' }), /account_id/);
console.log('PASS: Ozon complete capture, source dimensions, identity, bounded failures and no partial publication');
