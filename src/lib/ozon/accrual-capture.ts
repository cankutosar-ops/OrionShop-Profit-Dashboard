import { randomUUID } from 'node:crypto';

export type OzonAccrualCapture = {
  snapshotId: string; accountId: string; date: string; observedAt: string;
  accruals: Record<string, unknown>[]; pagesFetched: number;
  terminalReason: 'EMPTY_PAGE' | 'EMPTY_CURSOR'; accountingComplete: false;
};

/** Preserve source rows and exact decimal strings. No event deduplication or monetary inference. */
export async function captureOzonAccrualDay(input: {
  accountId: string; date: string;
  readNextPage: () => Promise<{ accruals: Record<string, unknown>[]; lastId: string; empty: boolean }>;
  publish: (capture: OzonAccrualCapture) => Promise<number>;
  maxPages?: number;
}) {
  if (!/^[1-9]\d*$/.test(input.accountId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      input.date < '2022-01-01' || !Number.isFinite(Date.parse(`${input.date}T00:00:00Z`)) ||
      new Date(`${input.date}T00:00:00Z`).toISOString().slice(0, 10) !== input.date) throw new Error('invalid_ozon_accrual_scope');
  const maxPages = input.maxPages ?? 5;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) throw new Error('invalid_ozon_accrual_budget');
  const observedAt = new Date().toISOString(), accruals: Record<string, unknown>[] = [], cursors = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    const value = await input.readNextPage();
    if (!Array.isArray(value.accruals) || typeof value.lastId !== 'string' ||
        value.empty !== (value.accruals.length === 0) ||
        !value.accruals.every(row => row !== null && typeof row === 'object' && !Array.isArray(row))) throw new Error('invalid_ozon_accrual_page');
    accruals.push(...value.accruals);
    if (accruals.length > 10000) throw new Error('ozon_accrual_row_budget_exhausted');
    if (value.empty || !value.lastId) {
      const capture: OzonAccrualCapture = { snapshotId: randomUUID(), accountId: input.accountId,
        date: input.date, observedAt, accruals, pagesFetched: page,
        terminalReason: value.empty ? 'EMPTY_PAGE' : 'EMPTY_CURSOR', accountingComplete: false };
      const persisted = await input.publish(capture);
      if (persisted !== accruals.length) throw new Error('ozon_accrual_persisted_count_mismatch');
      return { date: input.date, rowsPersisted: persisted, pagesFetched: page,
        status: persisted === 0 ? 'NO_ACCRUALS_REPORTED' as const : 'SOURCE_ROWS_STORED' as const,
        accountingComplete: false as const };
    }
    if (cursors.has(value.lastId)) throw new Error('ozon_accrual_cursor_not_advancing');
    cursors.add(value.lastId);
  }
  throw new Error('ozon_accrual_page_budget_exhausted'); // Publish nothing after a partial capture.
}
