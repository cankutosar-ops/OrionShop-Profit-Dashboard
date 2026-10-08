import { NextResponse } from 'next/server';
import { authorize, isAuthzFailure } from '@/lib/security/authorize';
import { canWriteCompanySettings, companySettingsWriteForbiddenResponse } from '@/lib/security/company-settings-authorization';
import { runOzonSourceSync } from '@/services/ozon-sync-service';
import { OzonReadError } from '@/lib/ozon/read-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.accountId !== 'string' || !['products','prices','stocks','fbs','fbo','finance','finance-types','realization-monthly'].includes(body.task) ||
        (body.month !== undefined && typeof body.month !== 'string') ||
        (body.date !== undefined && typeof body.date !== 'string') ||
        (body.from !== undefined && typeof body.from !== 'string') || (body.to !== undefined && typeof body.to !== 'string')) {
      return NextResponse.json({ error: 'Invalid bounded Ozon sync request' }, { status: 400 });
    }
    const authz = await authorize(request, { marketplaceAccountId: body.accountId, requireMarketplaceAccount: true });
    if (isAuthzFailure(authz)) return authz;
    if (!canWriteCompanySettings(authz.user)) return companySettingsWriteForbiddenResponse();
    const result = await runOzonSourceSync({ accountId: authz.marketplaceAccountId!, companyId: authz.companyId!,
      task: body.task, date: body.date, from: body.from, to: body.to, month: body.month });
    return NextResponse.json({ result, recurringScheduleEnabled: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof OzonReadError ? error.message : 'Ozon source sync failed; no automatic retry' }, { status: 409 });
  }
}
