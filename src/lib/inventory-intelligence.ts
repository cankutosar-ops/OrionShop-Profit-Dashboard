export const DEFAULT_TARGET_DAYS_OF_STOCK = 60;

export type InventoryRecommendation =
  | "Healthy"
  | "Stop Purchasing"
  | "Overstock"
  | "Produce / Purchase";

export type InventoryInputs = {
  currentStock: number;
  purchases30Day: number;
  unitCost: number;
  targetDays?: number;
};

export type InventoryMetrics = {
  currentStock: number;
  averageDailySales: number;
  recommendedStock: number;
  stockDifference: number;
  daysOfStock: number | null;
  stockValue: number;
  recommendation: InventoryRecommendation;
  /** Units to produce/purchase when recommendation is Produce / Purchase. */
  recommendationUnits: number | null;
};

export function calculateAverageDailySales(purchases30Day: number): number {
  return purchases30Day / 30;
}

export function calculateRecommendedStock(
  averageDailySales: number,
  targetDays: number
): number {
  return averageDailySales * targetDays;
}

export function calculateStockDifference(recommendedStock: number, currentStock: number): number {
  return recommendedStock - currentStock;
}

export function calculateDaysOfStock(
  currentStock: number,
  averageDailySales: number
): number | null {
  if (averageDailySales <= 0) return null;
  return currentStock / averageDailySales;
}

export function calculateStockValue(unitCost: number, currentStock: number): number {
  return unitCost * currentStock;
}

/** Within ±5% or ±1 unit, whichever is larger. */
export function isStockApproximatelyEqual(current: number, recommended: number): boolean {
  if (recommended <= 0) return current <= 0;
  const tolerance = Math.max(1, recommended * 0.05);
  return Math.abs(current - recommended) <= tolerance;
}

export function classifyInventoryRecommendation(
  currentStock: number,
  recommendedStock: number
): Pick<InventoryMetrics, "recommendation" | "recommendationUnits"> {
  if (recommendedStock > 0 && currentStock > recommendedStock * 2) {
    return { recommendation: "Overstock", recommendationUnits: null };
  }

  if (recommendedStock > 0 && currentStock > recommendedStock) {
    return { recommendation: "Stop Purchasing", recommendationUnits: null };
  }

  if (isStockApproximatelyEqual(currentStock, recommendedStock)) {
    return { recommendation: "Healthy", recommendationUnits: null };
  }

  if (currentStock < recommendedStock) {
    const units = Math.ceil(recommendedStock - currentStock);
    return { recommendation: "Produce / Purchase", recommendationUnits: units };
  }

  return { recommendation: "Healthy", recommendationUnits: null };
}

export function buildInventoryMetrics(input: InventoryInputs): InventoryMetrics {
  const targetDays = input.targetDays ?? DEFAULT_TARGET_DAYS_OF_STOCK;
  const averageDailySales = calculateAverageDailySales(input.purchases30Day);
  const recommendedStock = calculateRecommendedStock(averageDailySales, targetDays);
  const stockDifference = calculateStockDifference(recommendedStock, input.currentStock);
  const daysOfStock = calculateDaysOfStock(input.currentStock, averageDailySales);
  const stockValue = calculateStockValue(input.unitCost, input.currentStock);
  const { recommendation, recommendationUnits } = classifyInventoryRecommendation(
    input.currentStock,
    recommendedStock
  );

  return {
    currentStock: input.currentStock,
    averageDailySales,
    recommendedStock,
    stockDifference,
    daysOfStock,
    stockValue,
    recommendation,
    recommendationUnits,
  };
}

export type InventoryAggregate = InventoryMetrics & {
  currentStock: number;
  purchases30Day: number;
  unitCost: number;
  skuCount: number;
};

export function aggregateInventoryMetrics(
  rows: InventoryInputs[],
  targetDays: number = DEFAULT_TARGET_DAYS_OF_STOCK
): InventoryAggregate {
  const currentStock = rows.reduce((sum, row) => sum + row.currentStock, 0);
  const purchases30Day = rows.reduce((sum, row) => sum + row.purchases30Day, 0);
  const stockValue = rows.reduce(
    (sum, row) => sum + calculateStockValue(row.unitCost, row.currentStock),
    0
  );
  const unitCost = currentStock > 0 ? stockValue / currentStock : rows[0]?.unitCost ?? 0;

  const metrics = buildInventoryMetrics({
    currentStock,
    purchases30Day,
    unitCost,
    targetDays,
  });

  return {
    ...metrics,
    currentStock,
    purchases30Day,
    unitCost,
    stockValue,
    skuCount: rows.length,
  };
}

export function formatInventoryRecommendation(
  recommendation: InventoryRecommendation,
  units: number | null
): string {
  if (recommendation === "Produce / Purchase" && units !== null) {
    return `Produce / Purchase (+${units})`;
  }
  return recommendation;
}
