import { NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/auth-server';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  // Next's internal request URL can use a loopback hostname behind a proxy.
  // The browser-controlled Origin must match the actual request Host instead.
  const origin = request.headers.get('origin');
  let sameOrigin = false;
  try {
    const source = new URL(origin ?? '');
    sameOrigin = ['https:', 'http:'].includes(source.protocol) && source.host === request.headers.get('host');
  } catch { /* missing/invalid Origin is rejected */ }
  if (!sameOrigin) {
    return NextResponse.json({error:'Forbidden'}, {status:403});
  }
  const body = await request.json().catch(() => null) as {password?: unknown} | null;
  if (typeof body?.password !== 'string' || body.password.length < 8 || body.password.length > 256) {
    return NextResponse.json({error:'Invalid password'}, {status:400});
  }
  const supabase = await createAuthServerClient();
  const { data: {user}, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const {error} = await supabase.auth.updateUser({password:body.password});
  return NextResponse.json(error ? {error:'Password update failed'} : {ok:true}, {status:error ? 400 : 200, headers:{'Cache-Control':'no-store'}});
}
