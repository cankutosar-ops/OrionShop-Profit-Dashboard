/**
 * Sprint 11.1 — Administration shell public exports.
 */

export {
  ADMIN_NAV_SECTIONS,
  ADMIN_ROOT,
  buildAdminBreadcrumbs,
  findAdminNavItem,
  flattenAdminNav,
  isAdminNavActive,
  type AdminNavItem,
  type AdminNavSection,
} from "@/lib/administration/nav";
export {
  requireAdminAccess,
  type AdminAccessContext,
  type AdminAccessOptions,
} from "@/lib/administration/require-admin-access";
export {
  CONNECTION_STATUS_LABEL,
  latestSuccessfulSyncAt,
  resolveCompanyWarehouseHealth,
  resolveConnectionDisplayStatus,
  type ConnectionDisplayStatus,
  type WarehouseHealthDisplay,
} from "@/lib/administration/connection-status";
export type {
  PlatformSubsystemHealth,
  WarehouseControlCenterPayload,
} from "@/lib/administration/warehouse-control-types";
export type {
  DisplayMarketplace,
  ManagedUserDetails,
  ManagedUserSummary,
  MarketplaceAccessRow,
  MembershipRow,
  UserStatus,
} from "@/lib/administration/user-types";
export {
  DISPLAY_MARKETPLACE_LABEL,
  DISPLAY_MARKETPLACES,
} from "@/lib/administration/user-types";
export type {
  FeatureFlagRow,
  PlatformSettingsDocument,
} from "@/lib/administration/platform-settings-document";
export { DEFAULT_PLATFORM_SETTINGS } from "@/lib/administration/platform-settings-document";
export type {
  AuditEventRow,
  LoginHistoryRow,
} from "@/lib/administration/audit-types";
export type {
  RlsTableStatus,
  SecretHealthItem,
  SecurityBundlePayload,
  SecurityHealthTone,
} from "@/lib/administration/security-types";
