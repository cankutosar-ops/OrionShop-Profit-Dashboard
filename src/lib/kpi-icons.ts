import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Archive,
  Banknote,
  CircleDollarSign,
  CircleMinus,
  Coins,
  CreditCard,
  Heart,
  Landmark,
  Megaphone,
  Package,
  Percent,
  Receipt,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Tag,
  TrendingUp,
  Truck,
  Wallet,
  Warehouse,
} from "lucide-react";

/**
 * Canonical Lucide map for KPI identity.
 * Icons communicate meaning — not decoration.
 */
export const KPI_ICONS = {
  revenue: Banknote,
  profit: TrendingUp,
  orders: ShoppingCart,
  purchases: ShoppingBag,
  units: Package,
  inventory: Warehouse,
  settlement: Landmark,
  returns: RotateCcw,
  advertising: Megaphone,
  logistics: Truck,
  storage: Archive,
  conversion: Percent,
  cost: Coins,
  pricing: Tag,
  currency: CircleDollarSign,
  commission: Percent,
  acquiring: CreditCard,
  tax: Receipt,
  penalties: AlertTriangle,
  adjustments: CircleMinus,
  engagement: Heart,
  wallet: Wallet,
} as const satisfies Record<string, LucideIcon>;

export type KpiIconKey = keyof typeof KPI_ICONS;

export function kpiIcon(key: KpiIconKey): LucideIcon {
  return KPI_ICONS[key];
}
