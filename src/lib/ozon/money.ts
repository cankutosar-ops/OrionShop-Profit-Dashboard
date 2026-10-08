/** Exact decimal arithmetic for source money. Never round or parse through binary floats. */
export function decimal(value: unknown): string {
  if (typeof value !== 'string' || !/^-?\d{1,40}(?:\.\d{1,18})?$/.test(value)) throw new Error('invalid_ozon_decimal');
  const negative = value.startsWith('-'), [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const normalized = `${whole.replace(/^0+(?=\d)/, '')}${fraction.replace(/0+$/, '') ? '.' + fraction.replace(/0+$/, '') : ''}`;
  return negative && normalized !== '0' ? '-' + normalized : normalized;
}
export function addDecimal(...values: string[]): string {
  const normalized = values.map(decimal), scale = Math.max(0, ...normalized.map(v => v.split('.')[1]?.length ?? 0));
  const sum = normalized.reduce((n, v) => {
    const [whole, fraction = ''] = v.replace(/^-/, '').split('.');
    return n + (v.startsWith('-') ? BigInt(-1) : BigInt(1)) * BigInt(whole + fraction.padEnd(scale, '0'));
  }, BigInt(0));
  const digits = (sum < BigInt(0) ? -sum : sum).toString().padStart(scale + 1, '0');
  return decimal(`${sum < BigInt(0) ? '-' : ''}${scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits}`);
}
export function negateDecimal(value: string): string { const n = decimal(value); return n === '0' ? n : n.startsWith('-') ? n.slice(1) : '-' + n; }
export function money(value: unknown): { amount: string; currency: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('missing_ozon_money');
  const object = value as Record<string, unknown>;
  if (typeof object.currency !== 'string' || !/^[A-Z]{3}$/.test(object.currency)) throw new Error('invalid_ozon_currency');
  return { amount: decimal(object.amount), currency: object.currency };
}
