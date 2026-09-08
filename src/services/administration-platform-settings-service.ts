/**
 * Sprint 11.6 — Platform Settings persistence (presentation / preference config only).
 * Consumers must read via `@/lib/platform-config` — not Administration UI.
 * No financial math, warehouse engines, tax, credentials, or company/marketplace ownership.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isThemePreference } from "@/lib/theme";
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_PLATFORM_SETTINGS,
  type FeatureFlagRow,
  type PlatformSettingsDocument,
} from "@/lib/administration/platform-settings-document";

export type { FeatureFlagRow, PlatformSettingsDocument } from "@/lib/administration/platform-settings-document";
export {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_PLATFORM_SETTINGS,
} from "@/lib/administration/platform-settings-document";

function isMissingRelation(error: { message?: string } | null): boolean {
  if (!error?.message) return false;
  return /could not find the table|does not exist|schema cache|PGRST205/i.test(error.message);
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  return v || fallback;
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function mergeFeatureFlags(raw: unknown): FeatureFlagRow[] {
  const byId = new Map(DEFAULT_FEATURE_FLAGS.map((f) => [f.id, { ...f }]));
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = asString(r.id, "");
      if (!id || !byId.has(id)) continue;
      const prev = byId.get(id)!;
      byId.set(id, {
        ...prev,
        enabled: asBool(r.enabled, prev.enabled),
        name: asString(r.name, prev.name),
        description: asString(r.description, prev.description),
      });
    }
  }
  return [...byId.values()];
}

export function normalizePlatformSettings(raw: unknown): PlatformSettingsDocument {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const general = (src.general ?? {}) as Record<string, unknown>;
  const localization = (src.localization ?? {}) as Record<string, unknown>;
  const notifications = (src.notifications ?? {}) as Record<string, unknown>;
  const retention = (src.dataRetention ?? {}) as Record<string, unknown>;
  const system = (src.systemPreferences ?? {}) as Record<string, unknown>;
  const d = DEFAULT_PLATFORM_SETTINGS;

  const themeRaw = system.defaultTheme;
  const defaultTheme = isThemePreference(themeRaw) ? themeRaw : d.systemPreferences.defaultTheme;

  const exportRaw = String(system.defaultReportExportFormat ?? "").toLowerCase();
  const defaultReportExportFormat =
    exportRaw === "csv" || exportRaw === "pdf" || exportRaw === "xlsx"
      ? exportRaw
      : d.systemPreferences.defaultReportExportFormat;

  return {
    general: {
      platformName: asString(general.platformName, d.general.platformName),
      defaultLanguage: asString(general.defaultLanguage, d.general.defaultLanguage),
      defaultTimeZone: asString(general.defaultTimeZone, d.general.defaultTimeZone),
      dateFormat: asString(general.dateFormat, d.general.dateFormat),
      numberFormat: asString(general.numberFormat, d.general.numberFormat),
    },
    localization: {
      language: asString(localization.language, d.localization.language),
      region: asString(localization.region, d.localization.region),
      timeZone: asString(localization.timeZone, d.localization.timeZone),
    },
    notifications: {
      emailNotifications: asBool(notifications.emailNotifications, d.notifications.emailNotifications),
      systemAlerts: asBool(notifications.systemAlerts, d.notifications.systemAlerts),
      warehouseAlerts: asBool(notifications.warehouseAlerts, d.notifications.warehouseAlerts),
      securityAlerts: asBool(notifications.securityAlerts, d.notifications.securityAlerts),
    },
    featureFlags: mergeFeatureFlags(src.featureFlags),
    dataRetention: {
      auditLogsDays: asPositiveInt(retention.auditLogsDays, d.dataRetention.auditLogsDays),
      warehouseHistoryDays: asPositiveInt(
        retention.warehouseHistoryDays,
        d.dataRetention.warehouseHistoryDays
      ),
      syncHistoryDays: asPositiveInt(retention.syncHistoryDays, d.dataRetention.syncHistoryDays),
    },
    systemPreferences: {
      defaultPageSize: asPositiveInt(system.defaultPageSize, d.systemPreferences.defaultPageSize),
      defaultDashboardLandingPage: asString(
        system.defaultDashboardLandingPage,
        d.systemPreferences.defaultDashboardLandingPage
      ),
      defaultTheme,
      defaultReportExportFormat,
      commercialSyncIntervalMinutes: asPositiveInt(
        system.commercialSyncIntervalMinutes,
        d.systemPreferences.commercialSyncIntervalMinutes
      ),
      commercialSyncMaxLookbackDays: asPositiveInt(
        system.commercialSyncMaxLookbackDays,
        d.systemPreferences.commercialSyncMaxLookbackDays
      ),
    },
  };
}

export type PlatformSettingsPayload = {
  settings: PlatformSettingsDocument;
  updatedAt: string | null;
  available: boolean;
};

export async function getPlatformSettings(): Promise<PlatformSettingsPayload> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("settings, updated_at")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      if (isMissingRelation(error)) {
        return {
          settings: DEFAULT_PLATFORM_SETTINGS,
          updatedAt: null,
          available: false,
        };
      }
      throw new Error(`Failed to load platform settings: ${error.message}`);
    }

    return {
      settings: normalizePlatformSettings(data?.settings),
      updatedAt: data?.updated_at ? String(data.updated_at) : null,
      available: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingRelation({ message })) {
      return {
        settings: DEFAULT_PLATFORM_SETTINGS,
        updatedAt: null,
        available: false,
      };
    }
    throw err;
  }
}

export async function updatePlatformSettings(
  patch: Partial<PlatformSettingsDocument>,
  updatedBy?: string | null
): Promise<PlatformSettingsPayload> {
  const current = await getPlatformSettings();
  const merged = normalizePlatformSettings({
    ...current.settings,
    ...patch,
    general: { ...current.settings.general, ...(patch.general ?? {}) },
    localization: { ...current.settings.localization, ...(patch.localization ?? {}) },
    notifications: { ...current.settings.notifications, ...(patch.notifications ?? {}) },
    dataRetention: { ...current.settings.dataRetention, ...(patch.dataRetention ?? {}) },
    systemPreferences: {
      ...current.settings.systemPreferences,
      ...(patch.systemPreferences ?? {}),
    },
    featureFlags: patch.featureFlags ?? current.settings.featureFlags,
  });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .upsert(
      {
        id: "default",
        settings: merged,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      },
      { onConflict: "id" }
    )
    .select("settings, updated_at")
    .single();

  if (error) {
    if (isMissingRelation(error)) {
      throw new Error(
        "Platform settings table not applied. Run migration 20260801160000_platform_settings_11_6.sql"
      );
    }
    throw new Error(`Failed to save platform settings: ${error.message}`);
  }

  return {
    settings: normalizePlatformSettings(data.settings),
    updatedAt: data.updated_at ? String(data.updated_at) : null,
    available: true,
  };
}

export function assertSettingsPayloadSafe(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (
    /"password"\s*:|"api_key"\s*:|"api_key_encrypted"|"encrypted_|"access_token"|"refresh_token"/i.test(
      text
    )
  ) {
    throw new Error("Refusing to return credential-bearing settings payload");
  }
}
