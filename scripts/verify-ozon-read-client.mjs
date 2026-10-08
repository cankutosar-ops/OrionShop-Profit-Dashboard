import assert from "node:assert/strict";
import { createOzonReadClient, OzonReadError } from "../src/lib/ozon/read-client.ts";

const credentials = { clientId: "fixture-client", apiKey: "fixture-private-key" };
let calls = 0;
const make = (value, status = 200) => createOzonReadClient({
  ...credentials,
  fetch: async (url, options) => {
    calls++;
    assert.equal(new URL(url).origin, "https://api-seller.ozon.ru");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["Api-Key"], credentials.apiKey);
    assert.equal(options.method, "POST");
    return new Response(JSON.stringify(value), { status });
  },
});

for (const entity of ["products", "prices", "stocks"]) {
  const fixture = { items: [{ product_id: 42, offer_id: "fixture-offer" }],
    [entity === "products" ? "last_id" : "cursor"]: "next-page" };
  const client = make(entity === "products" ? { result: fixture } : fixture);
  const page = await client.readPage(entity, "", 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.exhausted, false);
  assert.equal(page.nextCursor, "next-page");
  assert.equal(JSON.stringify(client).includes(credentials.apiKey), false);
}
const empty = await make({ items: [], cursor: "" }).readPage("stocks");
assert.equal(empty.exhausted, true);

const cases = [
  [make({ items: {}, cursor: "x" }), "invalid_items"],
  [make({ items: [null], cursor: "x" }), "invalid_items"],
  [make({ items: [{}], cursor: 7 }), "invalid_cursor"],
  [make({ items: [{}], cursor: "" }), "cursor_not_advancing"],
  [make({ items: [{}], cursor: "same" }), "cursor_not_advancing", "same"],
  [make({ items: [{}, {}], cursor: "x" }), "page_exceeds_limit"],
  [make({ error: credentials.apiKey }, 429), "http_error"],
];
for (const [client, reason, cursor = ""] of cases) {
  await assert.rejects(client.readPage("stocks", cursor, 1), error => {
    assert.ok(error instanceof OzonReadError);
    assert.equal(error.reason, reason);
    assert.equal(error.message.includes(credentials.apiKey), false);
    return true;
  });
}
const before = calls;
await assert.rejects(make({}).readPage("finance"), /unsupported_entity/);
await assert.rejects(make({}).readPage("stocks", "", 101), /invalid_page_request/);
assert.equal(calls, before);
let attempts = 0;
const failing = createOzonReadClient({ ...credentials, fetch: async () => {
  attempts++; throw new Error(credentials.apiKey);
} });
await assert.rejects(failing.readPage("stocks"), error => {
  assert.equal(error.reason, "transport_failed");
  assert.equal(error.message.includes(credentials.apiKey), false);
  return true;
});
assert.equal(attempts, 1);
globalThis.window = {};
try {
  assert.throws(() => createOzonReadClient(credentials), /server_runtime_required/);
} finally { delete globalThis.window; }
console.log("PASS: Ozon read transport, three page envelopes, exhaustion, cursor/shape bounds, redaction, no retries and unsupported endpoint denial");
