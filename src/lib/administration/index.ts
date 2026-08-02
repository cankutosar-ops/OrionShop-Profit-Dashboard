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
