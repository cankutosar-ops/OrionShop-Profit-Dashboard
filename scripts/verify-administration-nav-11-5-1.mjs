/**
 * Sprint 11.5.1 — Administration navigation return path.
 * Run: npm run verify:administration-nav-11-5-1
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
console.log("=== Sprint 11.5.1 — Administration Navigation Fix ===\n");

const sidebarPath = resolve(root, "src/components/administration/admin-sidebar.tsx");
check("admin-sidebar.tsx exists", existsSync(sidebarPath));

const sidebar = readFileSync(sidebarPath, "utf8");
check("Return link targets Dashboard (/)", /href=\{?DASHBOARD_HREF\}?|href=["']\/["']/.test(sidebar));
check("Label includes Back to Dashboard", sidebar.includes("Back to Dashboard"));
check("Exit affordance (←) present", sidebar.includes("←"));
check("Uses Next.js Link (client nav — session/theme preserved)", sidebar.includes('from "next/link"'));
check("Return link is above ADMIN_NAV_SECTIONS map", (() => {
  const exitIdx = sidebar.indexOf("Back to Dashboard");
  const mapIdx = sidebar.indexOf("ADMIN_NAV_SECTIONS.map");
  return exitIdx > 0 && mapIdx > 0 && exitIdx < mapIdx;
})());
check("No logout on return path", !/signOut|logout|\/auth\/logout/i.test(sidebar));
check("Keyboard focus styles present", sidebar.includes("focus-visible"));
check("Hover styles present", sidebar.includes("hover:"));
check("Breadcrumb file unchanged by this sprint (exists)", existsSync(resolve(root, "src/components/administration/admin-breadcrumb.tsx")));

const breadcrumb = readFileSync(
  resolve(root, "src/components/administration/admin-breadcrumb.tsx"),
  "utf8"
);
check("Breadcrumb does not add exit link", !breadcrumb.includes("Back to Dashboard"));

console.log("\n=== Result ===");
if (failures === 0) {
  console.log("PASS — Sprint 11.5.1 Administration Navigation Fix");
  process.exit(0);
}
console.log(`FAIL — ${failures} check(s) failed`);
process.exit(1);
