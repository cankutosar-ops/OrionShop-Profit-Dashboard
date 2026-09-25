/** Product-attributed recent ad rate; low-volume observations defer to the manual floor. */
export function resolveRecentAdvertisingPercent(input: {
  completedUnits: number;
  netSales: number;
  spend: number;
  minimumUnits?: number;
}): number | null {
  const minimumUnits = input.minimumUnits ?? 20;
  if (input.completedUnits < minimumUnits || input.netSales <= 0 || input.spend < 0) return null;
  const rate = (input.spend / input.netSales) * 100;
  return Number.isFinite(rate) ? rate : null;
}
