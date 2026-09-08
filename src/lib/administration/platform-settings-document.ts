/**
 * Client-safe platform settings document + defaults.
 * No server / Supabase imports — safe for "use client" bundles.
 */

import type { ThemePreference } from "@/lib/theme";

export type FeatureFlagRow = {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
};

export type PlatformSettingsDocument = {
  general: {
    platformName: string;
    defaultLanguage: string;
    defaultTimeZone: string;
    dateFormat: string;
    numberFormat: string;
  };
  localization: {
    language: string;
    region: string;
    timeZone: string;
  };
  notifications: {
    emailNotifications: boolean;
    systemAlerts: boolean;
    warehouseAlerts: boolean;
    securityAlerts: boolean;
  };
  featureFlags: FeatureFlagRow[];
  dataRetention: {
    auditLogsDays: number;
    warehouseHistoryDays: number;
    syncHistoryDays: number;
  };
  systemPreferences: {
    defaultPageSize: number;
    defaultDashboardLandingPage: string;
    defaultTheme: ThemePreference;
    defaultReportExportFormat: "xlsx" | "csv" | "pdf";
    /** Minutes between commercial continuity ticks (Orders/Sales/Finance). */
    commercialSyncIntervalMinutes: number;
    /** Max days recovered per scheduled tick when data is behind. */
    commercialSyncMaxLookbackDays: number;
  };
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlagRow[] = [
  {
    id: "admin_security_audit",
    name: "Administration Security & Audit",
    enabled: true,
    description: "Security overview and audit log surfaces in Administration.",
  },
  {
    id: "warehouse_control_center",
    name: "Warehouse Control Center",
    enabled: true,
    description: "Operational warehouse visibility in Administration.",
  },
  {
    id: "user_management",
    name: "User Management",
    enabled: true,
    description: "Invite and manage users, roles, and memberships.",
  },
  {
    id: "smart_pricing",
    name: "Smart Pricing",
    enabled: true,
    description: "Profit simulator module (no formula changes from this flag).",
  },
  {
    id: "reporting_exports",
    name: "Reporting Exports",
    enabled: true,
    description: "Allow report export actions from the reporting UI.",
  },
  {
    id: "commercial_data_continuity",
    name: "Commercial Data Continuity",
    enabled: true,
    description:
      "Durable scheduled Orders/Sales/Finance sync independent of dashboard visits.",
  },
];

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsDocument = {
  general: {
    platformName: "OrionShop Profit Dashboard",
    defaultLanguage: "en",
    defaultTimeZone: "Europe/Moscow",
    dateFormat: "dd.MM.yyyy",
    numberFormat: "ru-RU",
  },
  localization: {
    language: "en",
    region: "RU",
    timeZone: "Europe/Moscow",
  },
  notifications: {
    emailNotifications: true,
    systemAlerts: true,
    warehouseAlerts: true,
    securityAlerts: true,
  },
  featureFlags: DEFAULT_FEATURE_FLAGS,
  dataRetention: {
    auditLogsDays: 365,
    warehouseHistoryDays: 90,
    syncHistoryDays: 180,
  },
  systemPreferences: {
    defaultPageSize: 25,
    defaultDashboardLandingPage: "/",
    defaultTheme: "system",
    defaultReportExportFormat: "xlsx",
    commercialSyncIntervalMinutes: 60,
    commercialSyncMaxLookbackDays: 14,
  },
};
