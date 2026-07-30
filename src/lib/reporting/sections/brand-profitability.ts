/**
 * Brand Intelligence — expanded brand profitability + rankings.
 * Aggregates product-level FE outputs only; ratios via presentation helpers.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import {
  averagePerUnit,
  contributionPercent,
  netMarginPercent,
  percentOfRevenue,
  rankBrandsBy,
  type RankedBrand,
} from "@/lib/reporting/section-utils";
import type { ProductProfitability } from "@/types/database";

const RANK_N = 10;

export type BrandProfitabilityRow = {
  brandName: string;
  revenue: number;
  unitsSold: number;
  /** Alias of unitsSold for older consumers. */
  units: number;
  orders: number;
  productCost: number;
  marketplaceFee: number;
  logistics: number;
  storage: number;
  returns: number;
  operatingProfit: number;
  netProfit: number;
  /** Alias of netProfit (Final Net Profit). */
  finalNetProfit: number;
  netMarginPercent: number;
  revenueSharePercent: number;
  profitSharePercent: number;
  averageSellingPrice: number | null;
  averageProfitPerUnit: number | null;
  returnRate: number;
  marketplaceFeePercent: number;
  logisticsPercent: number;
  contributionPercent: number;
  productCount: number;
};

export type BrandProfitabilityData = {
  brands: BrandProfitabilityRow[];
  totals: {
    revenue: number;
    finalNetProfit: number;
    unitsSold: number;
    orders: number;
    brandCount: number;
  };
  rankings: {
    highestRevenue: RankedBrand[];
    highestProfit: RankedBrand[];
    highestMargin: RankedBrand[];
    highestReturnRate: RankedBrand[];
    highestLogisticsCost: RankedBrand[];
  };
};

type BrandAcc = {
  brandName: string;
  revenue: number;
  unitsSold: number;
  orders: number;
  productCost: number;
  marketplaceFee: number;
  logistics: number;
  storage: number;
  returns: number;
  operatingProfit: number;
  finalNetProfit: number;
  productCount: number;
};

function emptyBrand(brandName: string): BrandAcc {
  return {
    brandName,
    revenue: 0,
    unitsSold: 0,
    orders: 0,
    productCost: 0,
    marketplaceFee: 0,
    logistics: 0,
    storage: 0,
    returns: 0,
    operatingProfit: 0,
    finalNetProfit: 0,
    productCount: 0,
  };
}

function accumulateProduct(acc: BrandAcc, p: ProductProfitability): void {
  acc.revenue += p.revenue;
  acc.unitsSold += p.unitsSold;
  acc.orders += p.orders;
  acc.productCost += p.productCost;
  acc.marketplaceFee += p.marketplaceFees;
  acc.logistics += p.logistics;
  acc.storage += p.storage;
  acc.returns += p.unitsReturned;
  acc.operatingProfit += p.netProfit;
  acc.finalNetProfit += p.finalNetProfit;
  acc.productCount += 1;
}

function brandReturnRate(unitsSold: number, returns: number): number {
  const base = unitsSold + returns;
  if (base <= 0) return 0;
  return (returns / base) * 100;
}

/**
 * Roll up trusted product rows by brandName.
 * Does not recalculate Model B — only sums product engine outputs.
 */
export function rollupBrandProfitability(
  products: ProductProfitability[]
): BrandProfitabilityRow[] {
  const byBrand = new Map<string, BrandAcc>();

  for (const product of products) {
    const key = product.brandName?.trim() || "Unassigned";
    const acc = byBrand.get(key) ?? emptyBrand(key);
    accumulateProduct(acc, product);
    byBrand.set(key, acc);
  }

  const rows = [...byBrand.values()];
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalProfit = rows.reduce((sum, row) => sum + row.finalNetProfit, 0);

  return rows
    .map((row) => {
      const netProfit = row.finalNetProfit;
      const profitShare = contributionPercent(netProfit, totalProfit);
      return {
        brandName: row.brandName,
        revenue: row.revenue,
        unitsSold: row.unitsSold,
        units: row.unitsSold,
        orders: row.orders,
        productCost: row.productCost,
        marketplaceFee: row.marketplaceFee,
        logistics: row.logistics,
        storage: row.storage,
        returns: row.returns,
        operatingProfit: row.operatingProfit,
        netProfit,
        finalNetProfit: netProfit,
        netMarginPercent: netMarginPercent(row.revenue, netProfit),
        revenueSharePercent: contributionPercent(row.revenue, totalRevenue),
        profitSharePercent: profitShare,
        averageSellingPrice: averagePerUnit(row.revenue, row.unitsSold),
        averageProfitPerUnit: averagePerUnit(netProfit, row.unitsSold),
        returnRate: brandReturnRate(row.unitsSold, row.returns),
        marketplaceFeePercent: percentOfRevenue(row.marketplaceFee, row.revenue),
        logisticsPercent: percentOfRevenue(row.logistics, row.revenue),
        contributionPercent: profitShare,
        productCount: row.productCount,
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit);
}

export function buildBrandProfitabilitySection(
  ctx: ReportContext
): ReportSection<BrandProfitabilityData> {
  const brands = rollupBrandProfitability(ctx.products);
  const totals = {
    revenue: brands.reduce((sum, b) => sum + b.revenue, 0),
    finalNetProfit: brands.reduce((sum, b) => sum + b.netProfit, 0),
    unitsSold: brands.reduce((sum, b) => sum + b.unitsSold, 0),
    orders: brands.reduce((sum, b) => sum + b.orders, 0),
    brandCount: brands.length,
  };

  return {
    id: "brand-profitability",
    kind: "brand-profitability",
    title: "Brand Intelligence",
    description:
      "Brand contribution and cost structure from product-level Financial Engine outputs",
    data: {
      brands,
      totals,
      rankings: {
        highestRevenue: rankBrandsBy(brands, (b) => b.revenue, RANK_N),
        highestProfit: rankBrandsBy(brands, (b) => b.netProfit, RANK_N),
        highestMargin: rankBrandsBy(
          brands.filter((b) => b.revenue > 0),
          (b) => b.netMarginPercent,
          RANK_N
        ),
        highestReturnRate: rankBrandsBy(brands, (b) => b.returnRate, RANK_N),
        highestLogisticsCost: rankBrandsBy(brands, (b) => b.logistics, RANK_N),
      },
    },
  };
}
