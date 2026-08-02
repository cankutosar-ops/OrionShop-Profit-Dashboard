/**
 * Theme support validation — Light / Dark / System.
 * Run: npx tsx scripts/verify-theme-support.mjs
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
console.log("=== Theme Support (Light / Dark / System) ===\n");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
check("next-themes dependency installed", Boolean(pkg.dependencies?.["next-themes"]));

const globals = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
check("Class-based dark variant configured", globals.includes("@custom-variant dark"));
check("Light theme tokens on :root", globals.includes(":root") && globals.includes("--app-background"));
check("Dark theme tokens on .dark", globals.includes(".dark") && globals.includes("#0b1220"));
check("Theme colors bound via CSS variables", globals.includes("var(--app-background)"));

const layout = readFileSync(resolve(root, "src/app/layout.tsx"), "utf8");
check("Root layout wraps ThemeProvider", layout.includes("ThemeProvider"));
check("html suppressHydrationWarning for theme", layout.includes("suppressHydrationWarning"));

const provider = readFileSync(
  resolve(root, "src/components/providers/theme-provider.tsx"),
  "utf8"
);
check("Provider enables system theme", provider.includes("enableSystem"));
check("Provider persists with orionshop.theme key", provider.includes("THEME_STORAGE_KEY"));
check("Provider uses class attribute", provider.includes('attribute="class"'));

const selector = readFileSync(
  resolve(root, "src/components/theme/theme-selector.tsx"),
  "utf8"
);
check("Selector offers Light", selector.includes('"light"') || selector.includes("Light"));
check("Selector offers Dark", selector.includes('"dark"') || selector.includes("Dark"));
check("Selector offers System", selector.includes('"system"') || selector.includes("System"));

const adminHeader = readFileSync(
  resolve(root, "src/components/administration/admin-header.tsx"),
  "utf8"
);
check("Administration header exposes ThemeSelector", adminHeader.includes("ThemeSelector"));

const themeLib = readFileSync(resolve(root, "src/lib/theme.ts"), "utf8");
check("Shared theme storage key exported", themeLib.includes("orionshop.theme"));

check(
  "No separate light/dark layout files",
  !existsSync(resolve(root, "src/app/(dark)")) &&
    !existsSync(resolve(root, "src/app/(light)"))
);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
