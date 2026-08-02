/**
 * Sprint 11.6 — Platform Settings validation.
 * Run: npm run verify:administration-platform-settings-11-6
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const root = resolve(process.cwd());
console.log("=== Sprint 11.6 — Platform Settings ===\n");

const required = [
  "supabase/migrations/20260801160000_platform_settings_11_6.sql",
  "src/lib/platform-config/provider.ts",
  "src/lib/platform-config/index.ts",
  "src/services/administration-platform-settings-service.ts",
  "src/app/api/administration/settings/route.ts",
  "src/components/administration/settings-section.tsx",
  "src/components/administration/settings-group.tsx",
  "src/components/administration/settings-card.tsx",
  "src/components/administration/settings-switch.tsx",
  "src/components/administration/settings-select.tsx",
  "src/components/administration/settings-input.tsx",
  "src/components/administration/settings-panel.tsx",
  "src/app/administration/settings/page.tsx",
];

console.log("--- Artifacts ---");
for (const rel of required) {
  check(rel, existsSync(resolve(root, rel)));
}

const migration = readFileSync(
  resolve(root, "supabase/migrations/20260801160000_platform_settings_11_6.sql"),
  "utf8"
);
check("Migration creates platform_settings", migration.includes("platform_settings"));
check(
  "Migration does not alter tax/financial business tables",
  !/ALTER TABLE.*(wb_sales|companies|product_cost)|default_tax_percent/i.test(migration)
);

const svc = readFileSync(
  resolve(root, "src/services/administration-platform-settings-service.ts"),
  "utf8"
);
check("Service has feature flags", svc.includes("featureFlags"));
check("Service has notifications", svc.includes("notifications"));
check("Service has data retention", svc.includes("dataRetention"));
check("Service does not own defaultCurrency (company-owned)", !svc.includes("defaultCurrency"));
check("Service does not import financial engine", !svc.includes("financial-engine"));
check("Service does not import warehouse engines", !svc.includes("@/lib/warehouse"));
check("Service does not import smart-pricing", !svc.includes("smart-pricing"));

const provider = resolve(root, "src/lib/platform-config/provider.ts");
const providerIndex = resolve(root, "src/lib/platform-config/index.ts");
check("Shared configuration provider exists", existsSync(provider));
check("Platform-config public entry exists", existsSync(providerIndex));
const providerSrc = readFileSync(provider, "utf8");
check("Provider exposes getPlatformConfiguration", providerSrc.includes("getPlatformConfiguration"));
check("Provider exposes isFeatureEnabled", providerSrc.includes("isFeatureEnabled"));
check(
  "Provider documents ownership boundaries",
  providerSrc.includes("Company Workspace") && providerSrc.includes("Marketplace Connections")
);

const api = readFileSync(resolve(root, "src/app/api/administration/settings/route.ts"), "utf8");
check(
  "Settings API reads via shared provider",
  api.includes("@/lib/platform-config") && api.includes("getPlatformConfigurationPayload")
);
check(
  "Settings API writes via shared provider",
  api.includes("savePlatformConfiguration")
);

const page = readFileSync(resolve(root, "src/app/administration/settings/page.tsx"), "utf8");
check("Settings page uses SettingsPanel", page.includes("SettingsPanel"));
check("Settings page is not placeholder", !page.includes("AdminPlaceholderPage"));

const panel = readFileSync(
  resolve(root, "src/components/administration/settings-panel.tsx"),
  "utf8"
);
check("Panel has General Settings", panel.includes("General Settings"));
check("Panel has Localization", panel.includes("Localization"));
check("Panel has Theme", panel.includes("Theme"));
check("Panel reuses ThemeSelector / ThemeProvider path", panel.includes("ThemeSelector"));
check("Panel uses useTheme from next-themes", panel.includes("next-themes"));
check("Panel has Notifications", panel.includes("Notifications"));
check("Panel has Feature Flags", panel.includes("Feature Flags"));
check("Panel has Data Retention", panel.includes("Data Retention"));
check("Panel has System Preferences", panel.includes("System Preferences"));
check("Feature flags persist via settings API", panel.includes("/api/administration/settings"));
check("Notifications persist via save", panel.includes("patchNotification"));
check("No tax settings UI", !panel.includes("Tax Rate") && !panel.includes("default_tax"));
check("No Default Currency field (company-owned)", !panel.includes("Default Currency"));
check("No marketplace credentials UI", !panel.includes("apiKey") && !panel.includes("api_key"));
check("No scheduler/queue settings", !panel.includes("Scheduler") && !panel.includes("Queue"));
check(
  "Panel references shared platform-config provider",
  panel.includes("@/lib/platform-config")
);

const themeLib = readFileSync(resolve(root, "src/lib/theme.ts"), "utf8");
check("Existing theme storage key unchanged", themeLib.includes("orionshop.theme"));

const themeProvider = readFileSync(
  resolve(root, "src/components/providers/theme-provider.tsx"),
  "utf8"
);
check("ThemeProvider still present", themeProvider.includes("NextThemesProvider"));

console.log("\n--- Components ---");
for (const name of [
  "SettingsSection",
  "SettingsGroup",
  "SettingsCard",
  "SettingsSwitch",
  "SettingsSelect",
  "SettingsInput",
]) {
  check(
    `${name} exported from index`,
    readFileSync(resolve(root, "src/components/administration/index.ts"), "utf8").includes(name)
  );
}

console.log("\n=== Result ===");
if (failures === 0) {
  console.log("PASS — Sprint 11.6 Platform Settings");
  process.exit(0);
}
console.log(`FAIL — ${failures} check(s) failed`);
process.exit(1);
