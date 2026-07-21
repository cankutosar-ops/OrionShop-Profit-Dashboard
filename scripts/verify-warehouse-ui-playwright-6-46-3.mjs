/**
 * Browser DOM evidence: Inventory warehouse labels must not contain Cyrillic.
 * Usage: npx playwright test is not required — run with node via playwright chromium.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const BASE = "http://localhost:3000";
const QS = "company=1&account=1&from=2026-06-20&to=2026-07-20";
const CYR = /[А-Яа-яЁё]/;

async function warehouseTexts(page, selector) {
  return page.$$eval(selector, (els) => els.map((el) => (el.textContent || "").trim()).filter(Boolean));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const evidence = { pages: {}, pass: true, errors: [] };

  // --- Warehouse Sales ---
  await page.goto(`${BASE}/inventory/warehouse-sales?${QS}`, { waitUntil: "networkidle", timeout: 120000 });
  const salesLabels = await warehouseTexts(page, "table tbody td a.font-medium, table tbody td a.text-primary");
  const salesCyr = salesLabels.filter((t) => CYR.test(t));
  evidence.pages.warehouseSales = {
    labels: salesLabels.slice(0, 20),
    cyrillicLabels: salesCyr,
    pass: salesCyr.length === 0 && salesLabels.length > 0,
  };
  if (!evidence.pages.warehouseSales.pass) evidence.pass = false;

  await page.screenshot({
    path: resolve("exports/browser-proof/6-46-3-warehouse-sales-latin.png"),
    fullPage: false,
  });

  // --- Inventory Intelligence (expand first row with distribution) ---
  await page.goto(`${BASE}/inventory/intelligence?${QS}`, { waitUntil: "networkidle", timeout: 180000 });
  // Expand first expandable row
  const expandBtn = page.locator('button[aria-label^="Expand warehouse distribution"]').first();
  if (await expandBtn.count()) {
    await expandBtn.click();
    await page.waitForTimeout(500);
  }
  const distLabels = await page.$$eval(
    "table table tbody td.font-medium, [class*='rounded-xl'] table tbody td.font-medium",
    (els) => els.map((el) => (el.textContent || "").trim()).filter(Boolean)
  );
  const distCyr = distLabels.filter((t) => CYR.test(t));
  evidence.pages.intelligence = {
    distributionLabels: distLabels.slice(0, 25),
    cyrillicLabels: distCyr,
    pass: distCyr.length === 0,
  };
  if (distLabels.length === 0) {
    evidence.pages.intelligence.note = "No distribution rows expanded (empty period or no expand control)";
  }
  if (!evidence.pages.intelligence.pass) evidence.pass = false;

  await page.screenshot({
    path: resolve("exports/browser-proof/6-46-3-intelligence-distribution-latin.png"),
    fullPage: false,
  });

  // --- Stock: open first model, Warehouses tab ---
  await page.goto(`${BASE}/inventory?${QS}`, { waitUntil: "networkidle", timeout: 120000 });
  const firstModel = page.locator("button, a, [role='button']").filter({ hasText: /./ }).first();
  // Click first row in model list
  const modelRow = page.locator("[class*='cursor-pointer'], button").filter({ hasText: /ZAR|ARI|SON|ALE|LIL|ESM/i }).first();
  if (await modelRow.count()) {
    await modelRow.click();
    await page.waitForTimeout(800);
    const whTab = page.getByRole("button", { name: "Warehouses" }).or(page.getByText("Warehouses", { exact: true }));
    if (await whTab.count()) {
      await whTab.first().click();
      await page.waitForTimeout(500);
    }
  }
  const stockWh = await page.$$eval("table tbody td.font-medium", (els) =>
    els.map((el) => (el.textContent || "").trim()).filter(Boolean)
  );
  // Prefer warehouse-looking labels (contain known Latin aliases or look like place names)
  const stockCyr = stockWh.filter((t) => CYR.test(t));
  evidence.pages.stockWarehouses = {
    labels: stockWh.slice(0, 25),
    cyrillicLabels: stockCyr,
    pass: stockCyr.length === 0,
  };
  if (!evidence.pages.stockWarehouses.pass) evidence.pass = false;

  await page.screenshot({
    path: resolve("exports/browser-proof/6-46-3-stock-warehouses-latin.png"),
    fullPage: false,
  });

  await browser.close();

  mkdirSync(resolve("exports"), { recursive: true });
  writeFileSync(
    resolve("exports/verify-warehouse-ui-playwright-6-46-3.json"),
    JSON.stringify(evidence, null, 2)
  );
  console.log(JSON.stringify(evidence, null, 2));
  console.log(evidence.pass ? "\nPASS" : "\nFAIL");
  process.exit(evidence.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
