import { NextResponse } from 'next/server';
import { authorize,isAuthzFailure } from '@/lib/security/authorize';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOzonFinance } from '@/services/ozon-finance-service';
import { renderOzonFinanceCsv } from '@/lib/ozon/finance-export';
import { isScopedOzonAccount } from '@/services/scoped-marketplace-service';

export const dynamic='force-dynamic';
export async function GET(request: Request) {
  const url=new URL(request.url),account=url.searchParams.get('account'),company=url.searchParams.get('company');
  const authz=await authorize(request,{account,company,requireMarketplaceAccount:true});
  if(isAuthzFailure(authz)) return authz;
  const from=url.searchParams.get('from') ?? '',to=url.searchParams.get('to') ?? '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({error:'Explicit report dates are required'},{status:400});
  try {
    const client=authz.isInternalService ? createAdminClient() : await createServerClient();
    const scope={companyId:authz.companyId!,marketplaceAccountId:authz.marketplaceAccountId!,from,to};
    if(!await isScopedOzonAccount(client,scope)) return NextResponse.json({error:'Ozon account required'},{status:400});
    const result=await getOzonFinance(client,scope.marketplaceAccountId,from,to);
    if(result.unavailable) return NextResponse.json({error:'Stored Ozon finance is unavailable'},{status:503});
    return new Response(renderOzonFinanceCsv(result.model),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="ozon-finance-${from}-${to}.csv"`,'Cache-Control':'private, no-store'}});
  } catch { return NextResponse.json({error:'Ozon finance export unavailable'},{status:400}); }
}
