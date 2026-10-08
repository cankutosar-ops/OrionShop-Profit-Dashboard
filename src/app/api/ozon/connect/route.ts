import { NextResponse } from 'next/server';
import { authorize, isAuthzFailure } from '@/lib/security/authorize';
import { canWriteCompanySettings, companySettingsWriteForbiddenResponse } from '@/lib/security/company-settings-authorization';
import { connectOzonAccount } from '@/services/ozon-connection-service';
import { OzonReadError } from '@/lib/ozon/read-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.companyId !== 'string' || typeof body.accountName !== 'string' ||
        typeof body.clientId !== 'string' || typeof body.apiKey !== 'string' ||
        (body.accountId !== undefined && typeof body.accountId !== 'string') ||
        (body.performance !== undefined && (typeof body.performance?.clientId !== 'string' || typeof body.performance?.clientSecret !== 'string'))) {
      return NextResponse.json({ error: 'Invalid Ozon connection fields' }, { status: 400 });
    }
    const authz = await authorize(request, { companyId: body.companyId, marketplaceAccountId: body.accountId });
    if (isAuthzFailure(authz)) return authz;
    if (!canWriteCompanySettings(authz.user)) return companySettingsWriteForbiddenResponse();
    const account = await connectOzonAccount({ companyId: authz.companyId!, accountId: body.accountId,
      accountName: body.accountName, clientId: body.clientId, apiKey: body.apiKey, performance: body.performance });
    return NextResponse.json({ account, lifecycle: { started: false, message: 'Connected. Source synchronization is manual.' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof OzonReadError ? error.message : 'Ozon connection could not be completed' }, { status: 400 });
  }
}
