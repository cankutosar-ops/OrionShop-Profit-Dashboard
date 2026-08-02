/**
 * Shared platform configuration — public entry for all modules.
 * Do not import Administration settings UI from business/warehouse code.
 */

export {
  getPlatformConfiguration,
  getPlatformConfigurationPayload,
  savePlatformConfiguration,
  isFeatureEnabled,
  getNotificationPreferences,
  getDataRetentionPreferences,
  getSystemPreferences,
  getLocalizationPreferences,
  type FeatureFlagRow,
  type PlatformSettingsDocument,
  type PlatformSettingsPayload,
} from "@/lib/platform-config/provider";
