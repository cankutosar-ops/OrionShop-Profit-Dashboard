"use client";
import type {ReactNode} from 'react';
import {useSearchParams} from 'next/navigation';
import {useAccountSwitch} from '@/components/layout/account-switch-context';
import {canShowMarketplaceContent} from '@/lib/marketplace-content-scope';
export function MarketplaceContentBoundary({accountId,companyId,children}:{accountId:string;companyId?:string;children:ReactNode}) {
  const params=useSearchParams(),{isBusy}=useAccountSwitch();
  if(!canShowMarketplaceContent({accountId,companyId,urlAccount:params.get('account'),urlCompany:params.get('company'),busy:isBusy}))return <div role="status" aria-live="polite" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading selected marketplace…</div>;
  return <>{children}</>;
}
