/** Read-only comparison; lossy legacy rows are classified, never rewritten. */
export type StockReconciliationRow = {
  nmId: number;
  warehouse: string;
  quantity: number;
  variant: string | null;
};

export type StockDifference = {
  key: string;
  legacy: number;
  canonical: number;
  classification: "mismatch" | "legacy_grain_loss_or_source_freshness";
};

function totals(rows: StockReconciliationRow[], key: (row: StockReconciliationRow) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    map.set(k, (map.get(k) ?? 0) + row.quantity);
  }
  return map;
}

function differences(
  legacy: Map<string, number>, canonical: Map<string, number>,
  lossy: (key: string) => boolean
): StockDifference[] {
  return [...new Set([...legacy.keys(), ...canonical.keys()])].sort().flatMap((key) => {
    const left = legacy.get(key) ?? 0;
    const right = canonical.get(key) ?? 0;
    return left === right ? [] : [{
      key, legacy: left, canonical: right,
      classification: lossy(key) ? "legacy_grain_loss_or_source_freshness" : "mismatch" as const,
    }];
  });
}

export function reconcileCurrentStock(
  legacy: StockReconciliationRow[],
  canonical: StockReconciliationRow[]
) {
  const lossyProducts = new Set(legacy.filter((row) => !row.variant).map((row) => String(row.nmId)));
  const lossyWarehouses = new Set(legacy.filter((row) => !row.variant).map((row) => row.warehouse));
  const totalLegacy = legacy.reduce((sum, row) => sum + row.quantity, 0);
  const totalCanonical = canonical.reduce((sum, row) => sum + row.quantity, 0);
  const comparableLegacyVariants = legacy.filter((row) => row.variant && !lossyProducts.has(String(row.nmId)));
  const comparableCanonicalVariants = canonical.filter((row) => row.variant && !lossyProducts.has(String(row.nmId)));
  return {
    total: {
      legacy: totalLegacy,
      canonical: totalCanonical,
      difference: totalCanonical - totalLegacy,
      classification: lossyProducts.size
        ? "legacy_grain_loss_or_source_freshness" : "mismatch",
    },
    productDifferences: differences(
      totals(legacy, (row) => String(row.nmId)),
      totals(canonical, (row) => String(row.nmId)),
      (key) => lossyProducts.has(key)
    ),
    warehouseDifferences: differences(
      totals(legacy, (row) => row.warehouse),
      totals(canonical, (row) => row.warehouse),
      (key) => lossyWarehouses.has(key)
    ),
    variantDifferences: differences(
      totals(comparableLegacyVariants, (row) => `${row.nmId}|${row.warehouse}|${row.variant}`),
      totals(comparableCanonicalVariants, (row) => `${row.nmId}|${row.warehouse}|${row.variant}`),
      () => false
    ),
    uncomparableLegacyRows: legacy.filter((row) => !row.variant).length,
    uncomparableCanonicalRows: canonical.filter((row) => !row.variant).length,
  };
}
