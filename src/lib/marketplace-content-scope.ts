/** Old account data must not remain visible during a marketplace/account transition. */
export function canShowMarketplaceContent(input:{accountId:string;companyId?:string;urlAccount:string|null;urlCompany:string|null;busy:boolean}) {
  if(input.busy)return false;
  if(input.urlAccount&&input.urlAccount!==input.accountId)return false;
  if(input.urlCompany&&input.urlCompany!==input.companyId)return false;
  return true;
}

export function clearMarketplaceSpecificFilters(params:URLSearchParams) {
  for(const key of ['brand','product','warehouse'])params.delete(key);
}
