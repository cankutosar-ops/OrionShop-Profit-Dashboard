/**
 * Client-safe Administration user management types & display constants.
 * No server imports — safe for "use client" bundles.
 */

import type { PlatformRole } from "@/lib/security/roles";

export type UserStatus = "active" | "invited" | "disabled";

export const DISPLAY_MARKETPLACES = [
  "wildberries",
  "ozon",
  "lamoda",
  "shopify",
] as const;

export type DisplayMarketplace = (typeof DISPLAY_MARKETPLACES)[number];

export const DISPLAY_MARKETPLACE_LABEL: Record<DisplayMarketplace, string> = {
  wildberries: "Wildberries",
  ozon: "Ozon",
  lamoda: "Lamoda",
  shopify: "Shopify",
};

export type ManagedUserSummary = {
  id: string;
  name: string;
  email: string;
  role: PlatformRole | null;
  roleLabel: string;
  companyIds: string[];
  companyNames: string[];
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string | null;
};

export type MembershipRow = {
  companyId: string;
  companyName: string;
  status: string;
};

export type MarketplaceAccessRow = {
  companyId: string;
  companyName: string;
  marketplaceAccountId: string;
  accountName: string;
  marketplace: DisplayMarketplace;
  marketplaceLabel: string;
  granted: boolean;
  /** When true, user has unrestricted access under company membership (no explicit list). */
  unrestrictedUnderCompany: boolean;
};

export type RecentActivityItem = {
  label: string;
  at: string | null;
};

export type ManagedUserDetails = ManagedUserSummary & {
  memberships: MembershipRow[];
  marketplaceAccess: MarketplaceAccessRow[];
  recentActivity: RecentActivityItem[];
};

export type InviteUserInput = {
  email: string;
  name?: string;
  companyId: string;
  role: PlatformRole;
  redirectTo?: string;
};

export type UpdateManagedUserInput = {
  name?: string;
  role?: PlatformRole;
};
