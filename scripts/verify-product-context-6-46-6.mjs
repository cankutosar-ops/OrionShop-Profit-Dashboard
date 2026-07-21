/**
 * Sprint 6.46.6 — Product context navigation verification (static).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const productContext = read("src/lib/product-context.ts");
const banner = read("src/components/layout/product-context-banner.tsx");
const sidebar = read("src/components/layout/sidebar.tsx");
const nav = read("src/lib/product-intelligence-nav.ts");
const drawer = read("src/components/inventory/product-intelligence-drawer.tsx");

assert(productContext.includes("PRODUCT_INTEL_NAV_PARAMS.productName"), "product_name param support");
assert(productContext.includes("buildNavHrefWithContext"), "nav href builder");
assert(productContext.includes("stripProductContextParams"), "clear context helper");
assert(banner.includes("Change Product"), "change product action");
assert(banner.includes("Clear Context"), "clear context action");
assert(sidebar.includes("buildNavHrefWithContext"), "sidebar preserves product context");
assert(nav.includes("productName"), "quick action emits product name");
assert(drawer.includes("productName: row.productName"), "drawer passes product name");

for (const page of [
  "src/app/analytics/products/page.tsx",
  "src/app/analytics/pricing/page.tsx",
  "src/app/purchases/page.tsx",
  "src/app/costs/page.tsx",
]) {
  assert(read(page).includes("ProductContextBannerSection"), `${page} shows banner`);
}

console.log("PASS — Sprint 6.46.6 product context navigation (static)");
