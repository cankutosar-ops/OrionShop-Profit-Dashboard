import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadOzonAccountReaders } from '@/services/ozon-account-readers';
import { captureOzonSource } from '@/lib/ozon/capture';
import { captureOzonAccrualDay } from '@/lib/ozon/accrual-capture';
import type { OzonReadEntity } from '@/lib/ozon/read-client';
import type { OzonCaptureJson } from '@/types/database';

export type OzonSyncTask = OzonReadEntity | 'fbs' | 'fbo' | 'finance' | 'finance-types' | 'realization-monthly';

/** One authorized account/task per invocation. No schedule, retry, WB dispatch, or accounting projection. */
export async function runOzonSourceSync(input: {
  accountId: string; companyId: string; task: OzonSyncTask; date?: string; from?: string; to?: string; month?: string;
}) {
  const client = createAdminClient(), token = randomUUID();
  const readers = await loadOzonAccountReaders({ ...input, client });
  const lease = await client.rpc('orion_acquire_ozon_sync', { p_account_id: input.accountId, p_token: token });
  if (lease.error || lease.data !== true) throw new Error('ozon_sync_busy_or_unavailable');
  const publish = async (capture: unknown) => {
    const result = await client.rpc('orion_publish_ozon_fenced_capture', {
      p_account_id: input.accountId, p_token: token, p_kind: input.task, p_capture: capture as OzonCaptureJson,
    });
    if (result.error || typeof result.data !== 'number') throw new Error('ozon_fenced_publication_failed');
    return result.data;
  };
  try {
    if (input.task === 'finance-types' || input.task === 'realization-monthly') {
      const capture = input.task === 'finance-types' ? await readers.captureAccrualTypes() : await readers.captureRealization(input.month ?? '');
      const result = await client.rpc('orion_publish_ozon_financial_reference', { p_account_id: input.accountId,
        p_token: token, p_kind: input.task, p_period_key: capture.periodKey, p_snapshot_id: randomUUID(),
        p_observed_at: capture.observedAt, p_payload: capture.payload as OzonCaptureJson });
      if (result.error || result.data !== capture.rows) throw new Error('ozon_financial_reference_publication_failed');
      return { task: input.task, rowsPersisted: result.data };
    }
    if (input.task === 'finance') {
      const session = readers.createAccrualSession(input.date ?? '');
      return await captureOzonAccrualDay({ accountId: input.accountId, date: input.date ?? '',
        readNextPage: session.readNextPage, publish, maxPages: 5 });
    }
    if (input.task === 'fbs' || input.task === 'fbo') {
      const capture = await readers.capturePostings(input.task, input.from ?? '', input.to ?? '', 5);
      const rowsPersisted = await publish({ ...capture, snapshotId: randomUUID() });
      if (rowsPersisted !== capture.postings.length) throw new Error('ozon_posting_persisted_count_mismatch');
      return { task: input.task, rowsPersisted, complete: true };
    }
    return await captureOzonSource({ accountId: input.accountId, entity: input.task,
      readPage: readers.readPage, publish, maxPages: 5, allowEmpty: true });
  } finally {
    const released = await client.rpc('orion_release_ozon_sync', { p_account_id: input.accountId, p_token: token });
    if (released.error || released.data !== true) throw new Error('ozon_lease_release_unconfirmed');
  }
}
