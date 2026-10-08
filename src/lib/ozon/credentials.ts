import {encryptCredential,decryptCredential} from '@/lib/credentials/encryption';
export type OzonCredentialPair={clientId:string;apiKey:string};
export type OzonPerformanceCredentialPair={clientId:string;clientSecret:string};
function validScope(accountId:string,companyId:string){return /^[1-9]\d*$/.test(accountId)&&/^[1-9]\d*$/.test(companyId)}

/** Explicit versioned Ozon envelope inside the existing opaque encrypted credential column. */
export function encryptOzonCredentials(input:OzonCredentialPair&{accountId:string;companyId:string;performance?:OzonPerformanceCredentialPair|null}):string {
  if(typeof window!=='undefined'||!validScope(input.accountId,input.companyId)||!input.clientId.trim()||!input.apiKey.trim()||/[\r\n]/.test(input.clientId+input.apiKey))throw new Error('invalid_ozon_credential_scope');
  if(input.performance&&(!input.performance.clientId.trim()||!input.performance.clientSecret.trim()||/[\r\n]/.test(input.performance.clientId+input.performance.clientSecret)))throw new Error('invalid_ozon_performance_credentials');
  return encryptCredential(JSON.stringify({kind:'ozon-seller-v1',accountId:input.accountId,companyId:input.companyId,clientId:input.clientId.trim(),apiKey:input.apiKey.trim(),
    ...(input.performance?{performance:{clientId:input.performance.clientId.trim(),clientSecret:input.performance.clientSecret.trim()}}:{})}));
}

export function decryptOzonPerformanceCredentials(ciphertext:string,scope:{accountId:string;companyId:string}):OzonPerformanceCredentialPair|null {
  decryptOzonCredentials(ciphertext,scope);
  try {
    const value=JSON.parse(decryptCredential(ciphertext));
    if(value.performance===undefined)return null;
    if(typeof value.performance?.clientId!=='string'||typeof value.performance?.clientSecret!=='string'||!value.performance.clientId.trim()||!value.performance.clientSecret.trim()||/[\r\n]/.test(value.performance.clientId+value.performance.clientSecret))throw new Error();
    return {clientId:value.performance.clientId,clientSecret:value.performance.clientSecret};
  }catch{throw new Error('ozon_performance_credentials_unavailable')}
}

export function decryptOzonCredentials(ciphertext:string,scope:{accountId:string;companyId:string}):OzonCredentialPair {
  try {
    if(typeof window!=='undefined'||!validScope(scope.accountId,scope.companyId))throw new Error();
    const value=JSON.parse(decryptCredential(ciphertext));
    if(value?.kind!=='ozon-seller-v1'||value.accountId!==scope.accountId||value.companyId!==scope.companyId||
      typeof value.clientId!=='string'||typeof value.apiKey!=='string'||!value.clientId.trim()||!value.apiKey.trim()||/[\r\n]/.test(value.clientId+value.apiKey))throw new Error();
    return {clientId:value.clientId,apiKey:value.apiKey};
  }catch{throw new Error('ozon_credentials_unavailable_or_scope_mismatch')}
}
