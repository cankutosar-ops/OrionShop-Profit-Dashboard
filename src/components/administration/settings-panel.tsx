"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { SettingsCard } from "@/components/administration/settings-card";
import { SettingsGroup } from "@/components/administration/settings-group";
import { SettingsInput } from "@/components/administration/settings-input";
import { SettingsSection } from "@/components/administration/settings-section";
import { SettingsSelect } from "@/components/administration/settings-select";
import { SettingsSwitch } from "@/components/administration/settings-switch";
import type { ThemePreference } from "@/lib/theme";
import { isThemePreference } from "@/lib/theme";
import {
  DEFAULT_PLATFORM_SETTINGS,
  type PlatformSettingsDocument,
} from "@/lib/administration/platform-settings-document";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ru", label: "Russian" },
];

const REGION_OPTIONS = [
  { value: "RU", label: "Russia (RU)" },
  { value: "US", label: "United States (US)" },
  { value: "EU", label: "European Union (EU)" },
];

const TIMEZONE_OPTIONS = [
  { value: "Europe/Moscow", label: "Europe/Moscow" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Asia/Almaty", label: "Asia/Almaty" },
];

const DATE_FORMAT_OPTIONS = [
  { value: "dd.MM.yyyy", label: "dd.MM.yyyy" },
  { value: "MM/dd/yyyy", label: "MM/dd/yyyy" },
  { value: "yyyy-MM-dd", label: "yyyy-MM-dd" },
];

const NUMBER_FORMAT_OPTIONS = [
  { value: "ru-RU", label: "ru-RU (1 234,56)" },
  { value: "en-US", label: "en-US (1,234.56)" },
  { value: "de-DE", label: "de-DE (1.234,56)" },
];

const EXPORT_OPTIONS = [
  { value: "xlsx", label: "Excel (XLSX)" },
  { value: "csv", label: "CSV" },
  { value: "pdf", label: "PDF" },
];

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const LANDING_OPTIONS = [
  { value: "/", label: "Dashboard (/)" },
  { value: "/analytics/products", label: "Product Analytics" },
  { value: "/reports", label: "Reports" },
  { value: "/administration", label: "Administration" },
];

export function SettingsPanel() {
  const { setTheme } = useTheme();
  const [settings, setSettings] = useState<PlatformSettingsDocument>(DEFAULT_PLATFORM_SETTINGS);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/administration/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
      setSettings(data.settings ?? DEFAULT_PLATFORM_SETTINGS);
      setAvailable(data.available !== false);
      setSavedAt(data.updatedAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: PlatformSettingsDocument) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/administration/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");
      setSettings(data.settings);
      setAvailable(data.available !== false);
      setSavedAt(data.updatedAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setBusy(false);
    }
  }

  function patchGeneral(key: keyof PlatformSettingsDocument["general"], value: string) {
    setSettings((s) => ({ ...s, general: { ...s.general, [key]: value } }));
  }

  function patchLocalization(
    key: keyof PlatformSettingsDocument["localization"],
    value: string
  ) {
    setSettings((s) => ({ ...s, localization: { ...s.localization, [key]: value } }));
  }

  function patchNotification(
    key: keyof PlatformSettingsDocument["notifications"],
    value: boolean
  ) {
    const next = {
      ...settings,
      notifications: { ...settings.notifications, [key]: value },
    };
    setSettings(next);
    void save(next);
  }

  function patchFeatureFlag(id: string, enabled: boolean) {
    const next = {
      ...settings,
      featureFlags: settings.featureFlags.map((f) =>
        f.id === id ? { ...f, enabled } : f
      ),
    };
    setSettings(next);
    void save(next);
  }

  function patchRetention(
    key: keyof PlatformSettingsDocument["dataRetention"],
    value: string
  ) {
    setSettings((s) => ({
      ...s,
      dataRetention: { ...s.dataRetention, [key]: Number(value) || 1 },
    }));
  }

  function patchSystem(
    key: keyof PlatformSettingsDocument["systemPreferences"],
    value: string
  ) {
    setSettings((s) => {
      const systemPreferences = { ...s.systemPreferences };
      if (key === "defaultPageSize") {
        systemPreferences.defaultPageSize = Number(value) || 25;
      } else if (key === "defaultTheme" && isThemePreference(value)) {
        systemPreferences.defaultTheme = value;
      } else if (key === "defaultReportExportFormat") {
        systemPreferences.defaultReportExportFormat = value as "xlsx" | "csv" | "pdf";
      } else if (key === "defaultDashboardLandingPage") {
        systemPreferences.defaultDashboardLandingPage = value;
      }
      return { ...s, systemPreferences };
    });
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading platform settings…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Platform-wide configuration only. Company currency/tax live in Company Workspace;
          marketplace credentials live in Marketplace Connections. Modules consume settings via{" "}
          <code className="text-xs">@/lib/platform-config</code>.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
            onClick={() => void load()}
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={busy || !available}
            className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            onClick={() => void save(settings)}
          >
            Save changes
          </button>
        </div>
      </div>

      {!available ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Settings table not applied yet — showing defaults. Run migration{" "}
          <code className="text-xs">20260801160000_platform_settings_11_6.sql</code> to persist.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {savedAt ? (
        <p className="text-xs text-muted-foreground">
          Last saved: {new Date(savedAt).toLocaleString()}
        </p>
      ) : null}

      <SettingsSection
        title="General Settings"
        description="Presentation defaults only — no business calculations."
      >
        <SettingsCard>
          <SettingsGroup>
            <SettingsInput
              id="platformName"
              label="Platform Name"
              value={settings.general.platformName}
              onChange={(v) => patchGeneral("platformName", v)}
            />
            <SettingsSelect
              id="defaultLanguage"
              label="Default Language"
              value={settings.general.defaultLanguage}
              options={LANGUAGE_OPTIONS}
              onChange={(v) => patchGeneral("defaultLanguage", v)}
            />
            <SettingsSelect
              id="defaultTimeZone"
              label="Default Time Zone"
              value={settings.general.defaultTimeZone}
              options={TIMEZONE_OPTIONS}
              onChange={(v) => patchGeneral("defaultTimeZone", v)}
            />
            <SettingsSelect
              id="dateFormat"
              label="Date Format"
              value={settings.general.dateFormat}
              options={DATE_FORMAT_OPTIONS}
              onChange={(v) => patchGeneral("dateFormat", v)}
            />
            <SettingsSelect
              id="numberFormat"
              label="Number Format"
              value={settings.general.numberFormat}
              options={NUMBER_FORMAT_OPTIONS}
              onChange={(v) => patchGeneral("numberFormat", v)}
            />
          </SettingsGroup>
          <p className="mt-3 text-xs text-muted-foreground">
            Default currency remains a Company Workspace setting — not duplicated here.
          </p>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Localization"
        description="Language, region, and time zone. Additional languages can be added without redesign."
      >
        <SettingsCard>
          <SettingsGroup>
            <SettingsSelect
              id="locLanguage"
              label="Language"
              value={settings.localization.language}
              options={LANGUAGE_OPTIONS}
              onChange={(v) => patchLocalization("language", v)}
            />
            <SettingsSelect
              id="locRegion"
              label="Region"
              value={settings.localization.region}
              options={REGION_OPTIONS}
              onChange={(v) => patchLocalization("region", v)}
            />
            <SettingsSelect
              id="locTimeZone"
              label="Time Zone"
              value={settings.localization.timeZone}
              options={TIMEZONE_OPTIONS}
              onChange={(v) => patchLocalization("timeZone", v)}
            />
          </SettingsGroup>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Theme"
        description="Uses the existing ThemeProvider. Light / Dark / System — same global preference as the Administration header."
      >
        <SettingsCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Changes apply immediately and persist in localStorage (
              <code className="text-xs">orionshop.theme</code>).
            </p>
            <ThemeSelector size="md" />
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="Platform-level enable/disable preferences only — no notification engine changes."
      >
        <SettingsCard>
          <SettingsGroup>
            <SettingsSwitch
              id="emailNotifications"
              label="Email Notifications"
              description="Operational email digests (when delivery is configured)."
              checked={settings.notifications.emailNotifications}
              disabled={busy}
              onChange={(v) => patchNotification("emailNotifications", v)}
            />
            <SettingsSwitch
              id="systemAlerts"
              label="System Alerts"
              checked={settings.notifications.systemAlerts}
              disabled={busy}
              onChange={(v) => patchNotification("systemAlerts", v)}
            />
            <SettingsSwitch
              id="warehouseAlerts"
              label="Warehouse Alerts"
              checked={settings.notifications.warehouseAlerts}
              disabled={busy}
              onChange={(v) => patchNotification("warehouseAlerts", v)}
            />
            <SettingsSwitch
              id="securityAlerts"
              label="Security Alerts"
              checked={settings.notifications.securityAlerts}
              disabled={busy}
              onChange={(v) => patchNotification("securityAlerts", v)}
            />
          </SettingsGroup>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Feature Flags"
        description="Thin configuration layer. Toggles visibility intent only — no feature implementations."
      >
        <SettingsCard>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Feature</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 font-medium">Toggle</th>
                </tr>
              </thead>
              <tbody>
                {settings.featureFlags.map((flag) => (
                  <tr key={flag.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{flag.name}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={
                          flag.enabled
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {flag.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{flag.description}</td>
                    <td className="py-2.5">
                      <SettingsSwitch
                        id={`flag-${flag.id}`}
                        label={flag.name}
                        compact
                        checked={flag.enabled}
                        disabled={busy}
                        onChange={(v) => patchFeatureFlag(flag.id, v)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Data Retention"
        description="Inventory snapshot history is purged automatically using Warehouse History Retention. Audit/sync knobs are configuration only."
      >
        <SettingsCard>
          <SettingsGroup>
            <SettingsInput
              id="auditLogsDays"
              label="Audit Logs Retention (days)"
              type="number"
              min={1}
              value={settings.dataRetention.auditLogsDays}
              onChange={(v) => patchRetention("auditLogsDays", v)}
            />
            <SettingsInput
              id="warehouseHistoryDays"
              label="Inventory Snapshot Retention (days)"
              type="number"
              min={1}
              value={settings.dataRetention.warehouseHistoryDays}
              onChange={(v) => patchRetention("warehouseHistoryDays", v)}
            />
            <SettingsInput
              id="syncHistoryDays"
              label="Sync History Retention (days)"
              type="number"
              min={1}
              value={settings.dataRetention.syncHistoryDays}
              onChange={(v) => patchRetention("syncHistoryDays", v)}
            />
          </SettingsGroup>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="System Preferences"
        description="Presentation preferences for paging, landing page, default theme, and exports."
      >
        <SettingsCard>
          <SettingsGroup>
            <SettingsInput
              id="defaultPageSize"
              label="Default Page Size"
              type="number"
              min={5}
              value={settings.systemPreferences.defaultPageSize}
              onChange={(v) => patchSystem("defaultPageSize", v)}
            />
            <SettingsSelect
              id="defaultDashboardLandingPage"
              label="Default Dashboard Landing Page"
              value={settings.systemPreferences.defaultDashboardLandingPage}
              options={LANDING_OPTIONS}
              onChange={(v) => patchSystem("defaultDashboardLandingPage", v)}
            />
            <SettingsSelect
              id="defaultTheme"
              label="Default Theme"
              value={settings.systemPreferences.defaultTheme}
              options={THEME_OPTIONS}
              onChange={(v) => {
                patchSystem("defaultTheme", v);
                if (isThemePreference(v)) setTheme(v as ThemePreference);
              }}
            />
            <SettingsSelect
              id="defaultReportExportFormat"
              label="Default Report Export Format"
              value={settings.systemPreferences.defaultReportExportFormat}
              options={EXPORT_OPTIONS}
              onChange={(v) => patchSystem("defaultReportExportFormat", v)}
            />
          </SettingsGroup>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
