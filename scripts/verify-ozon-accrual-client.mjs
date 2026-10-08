import assert from 'node:assert/strict';
import { createOzonAccrualReadSession } from '../src/lib/ozon/finance-read-client.ts';

// Sanitized structural fixture adapted from owner-supplied current Ozon example.
// Monetary signs/relationships are not inferred by the transport.
const fixture = { accrued_category: 'UNSPECIFIED', date: '2026-09-30', accrual_id: 3,
  unit_number: 'fixture-unit', total_amount: { amount: '-6.46', currency: 'RUB' },
  container_fees: { fees: [{ type_id: 7, accrued: { amount: '-6.46', currency: 'RUB' } }] },
  item_fees: { fees: [{ sku: 99, fees: [{ type_id: 7, accrued: { amount: '-1.00', currency: 'RUB' } }] }] },
  posting: { delivery_schema: 'fixture', products: [{ sku: 99,
    commission: { commission: { amount: '-2.00', currency: 'RUB' }, sale_amount: { amount: '10.00', currency: 'RUB' } },
    delivery: { services: [{ type_id: 8, accrued: {} }], total_accrued: { amount: '-3.00', currency: 'RUB' } } }] } };
let clock = 0;
let calls = [];
const make = (pages, extra = {}) => createOzonAccrualReadSession({ date: '2026-09-30',
  clientId: 'fixture-client', apiKey: 'fixture-secret', now: () => clock,
  fetch: async (url, options) => {
    assert.equal(url, 'https://api-seller.ozon.ru/v1/finance/accrual/by-day');
    assert.equal(options.redirect, 'error');
    calls.push(JSON.parse(options.body));
    const page = pages.shift();
    if (page instanceof Error) throw page;
    return new Response(JSON.stringify(page), { status: extra.status ?? 200 });
  }, ...extra });
const session = make([{ accruals: [fixture, { ...fixture, unit_number: 'other-unit' }], last_id: 'next' }, { accruals: [], last_id: '' }]);
const page = await session.readNextPage();
assert.deepEqual(page.accruals, [fixture, { ...fixture, unit_number: 'other-unit' }]); // Raw rows are preserved; global event-key semantics are not inferred.
assert.equal(page.accruals[0].total_amount.amount, '-6.46'); // No float conversion/summing.
await session.readNextPage();
assert.deepEqual(calls, [{ date: '2026-09-30', last_id: '' }, { date: '2026-09-30', last_id: 'next' }]);
await assert.rejects(session.readNextPage(), /session_not_readable/);
assert.equal(JSON.stringify(session).includes('fixture-secret'), false);
for (const date of ['2021-12-31', '2026-02-30', 'not-a-date']) assert.throws(() => make([], { date }), /invalid_accrual_date/);
const expiring = make([{ accruals: [fixture], last_id: 'cursor' }]);
await expiring.readNextPage();
clock = 15 * 60 * 1000;
await assert.rejects(expiring.readNextPage(), /cursor_expired/);
const failed = make([new Error('fixture-secret')]);
await assert.rejects(failed.readNextPage(), /transport_failed/);
const count = calls.length;
await assert.rejects(failed.readNextPage(), /session_not_readable/);
assert.equal(calls.length, count);
for (const value of [{ accruals: [null], last_id: '' }, { accruals: {}, last_id: '' }, { accruals: [], last_id: 2 }]) {
  await assert.rejects(make([value]).readNextPage(), /invalid_accrual_envelope/);
}
const stalled = make([{ accruals: [fixture], last_id: 'c' }, { accruals: [fixture], last_id: 'c' }]);
await stalled.readNextPage();
await assert.rejects(stalled.readNextPage(), /cursor_not_advancing/);
const largeId=createOzonAccrualReadSession({clientId:'fixture',apiKey:'fixture-secret',date:'2026-10-05',fetch:async()=>new Response('{"accruals":[{"accrual_id":9007199254740993,"total_amount":{"amount":"-1.2300","currency":"RUB"}}],"last_id":""}')});
const largePage=await largeId.readNextPage();
assert.equal(largePage.accruals[0].accrual_id,'9007199254740993');assert.equal(largePage.accruals[0].total_amount.amount,'-1.2300');
console.log('PASS: accrual day/cursor contract, 15-minute expiry, exact int64 identities/amount text, preserved component evidence, no source-row deduplication, redaction and no retry');
