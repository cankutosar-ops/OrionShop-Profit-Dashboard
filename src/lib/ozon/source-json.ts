/** Preserve unsafe integer source identities as decimal text; quoted monetary strings stay intact. */
export function parseOzonSourceJson(text:string, preserveAllNumbers=false):unknown {
  return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    token=>!token.startsWith('"')&&(preserveAllNumbers||(/^-?\d+$/.test(token)&&!Number.isSafeInteger(Number(token))))?JSON.stringify(token):token));
}
