/**
 * Sprint 11.6 — Shared Platform Configuration Provider.
 *
 * Single source of truth for platform-wide configuration.
 * Business / Warehouse / Company modules must consume settings through this
 * provider — never from Administration UI components.
 *
 * Ownership boundaries:
 * - Platform: presentation prefs, flags, notifications, retention knobs (this module)
 * - Company: currency, tax rate, company timezone/language → Company Workspace
 * - Marketplace: credentials, connection settings → Marketplace Connections
 */

import {
  getPlatformSettings,
  updatePlatformSettings,
  type FeatureFlagRow,
  type PlatformSettingsDocument,
  type PlatformSettingsPayload,
} from "@/services/administration-platform-settings-service";

export type {
  FeatureFlagRow,
  PlatformSettingsDocument,
  PlatformSettingsPayload,
};

/** Read full platform configuration (normalized defaults when store unavailable). */
export async function getPlatformConfiguration(): Promise<PlatformSettingsDocument> {
  const payload = await getPlatformSettings();
  return payload.settings;
}

/** Read with availability metadata (Administration / diagnostics). */
export async function getPlatformConfigurationPayload(): Promise<PlatformSettingsPayload> {
  return getPlatformSettings();
}

/** Persist platform configuration (Administration Settings only). */
export async function savePlatformConfiguration(
  patch: Partial<PlatformSettingsDocument>,
  updatedBy?: string | null
): Promise<PlatformSettingsPayload> {
  return updatePlatformSettings(patch, updatedBy);
}

export async function isFeatureEnabled(featureId: string): Promise<boolean> {
  const config = await getPlatformConfiguration();
  const flag = config.featureFlags.find((f) => f.id === featureId);
  return flag?.enabled ?? false;
}

export async function getNotificationPreferences(): Promise<
  PlatformSettingsDocument["notifications"]
> {
  const config = await getPlatformConfiguration();
  return config.notifications;
}

export async function getDataRetentionPreferences(): Promise<
  PlatformSettingsDocument["dataRetention"]
> {
  const config = await getPlatformConfiguration();
  return config.dataRetention;
}

export async function getSystemPreferences(): Promise<
  PlatformSettingsDocument["systemPreferences"]
> {
  const config = await getPlatformConfiguration();
  return config.systemPreferences;
}

export async function getLocalizationPreferences(): Promise<
  PlatformSettingsDocument["localization"]
> {
  const config = await getPlatformConfiguration();
  return config.localization;
}
