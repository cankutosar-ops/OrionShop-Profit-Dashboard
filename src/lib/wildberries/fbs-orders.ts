export type WbFbsOrderEvidence = {
  rid: string; assemblyOrderId: number; sellerWarehouseId: number;
  nmId: number; chrtId: number; createdAt: string;
};

/** JSON lexical tokens: preserve unsafe int64 pagination without touching quoted strings. */
export function parseWbInt64Json(text: string): unknown {
  return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token =>
    /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token));
}

export function parseFbsOrderPage(raw: unknown): { orders: WbFbsOrderEvidence[]; next: string } {
  const page = raw as { orders?: unknown; next?: unknown } | null;
  if (!page || !Array.isArray(page.orders)) throw new Error("Invalid FBS page shape");
  const next = typeof page.next === "string" ? page.next : typeof page.next === "number" && Number.isSafeInteger(page.next) ? String(page.next) : "";
  if (!/^\d+$/.test(next)) throw new Error("Invalid FBS pagination cursor");
  const positive = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid FBS numeric identity");
    return value;
  };
  const orders: WbFbsOrderEvidence[] = [];
  for (const row of page.orders) {
    if (!row || typeof row !== "object") throw new Error("Invalid FBS order shape");
    const value = row as Record<string, unknown>;
    if (typeof value.deliveryType !== "string") throw new Error("Missing FBS delivery model");
    if (value.deliveryType !== "fbs") continue;
    if (typeof value.rid !== "string" || !value.rid.trim() || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) throw new Error("Invalid FBS linkage identity/date");
    orders.push({ rid: value.rid.trim(), assemblyOrderId: positive(value.id), sellerWarehouseId: positive(value.warehouseId),
      nmId: positive(value.nmId), chrtId: positive(value.chrtId), createdAt: value.createdAt });
  }
  return { orders, next };
}

/** Complete bounded source capture before persisting. No order status changes or automatic retry. */
export async function fetchFbsOrderEvidence(token: string, from: string, to: string, request: typeof fetch = fetch) {
  const dateFrom = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`) + 86400000;
  if (!token.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    !Number.isFinite(dateFrom) || !Number.isFinite(end) || end <= dateFrom || end - dateFrom > 30 * 86400000) throw new Error("FBS capture requires explicit period of at most 30 days");
  let next = "0";
  const cursors = new Set<string>();
  const captured = new Map<string, WbFbsOrderEvidence>();
  for (let page = 0; page < 20; page++) {
    const url = new URL("https://marketplace-api.wildberries.ru/api/v3/orders");
    for (const [k, v] of Object.entries({ limit: "1000", next, dateFrom: String(dateFrom / 1000), dateTo: String(end / 1000 - 1) })) url.searchParams.set(k, v);
    const response = await request(url, { headers: { Authorization: token }, redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`WB FBS orders HTTP ${response.status}`);
    const parsed = parseFbsOrderPage(parseWbInt64Json(await response.text()));
    for (const order of parsed.orders) {
      const previous = captured.get(order.rid);
      if (previous && JSON.stringify(previous) !== JSON.stringify(order)) throw new Error("Conflicting FBS source identity");
      captured.set(order.rid, order);
    }
    if (parsed.next === "0") return [...captured.values()];
    if (cursors.has(parsed.next) || parsed.next === next) throw new Error("FBS pagination did not progress");
    cursors.add(parsed.next); next = parsed.next;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("FBS source capture exceeded bounded page limit");
}
