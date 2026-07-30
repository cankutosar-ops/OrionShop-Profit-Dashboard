/**
 * Browser proof for Sprint rejected fixes — soft account switch + UI visibility.
 * Run: node scripts/browser-proof-account-switch.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const BASE = process.env.PROOF_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(".perf/browser-proof");
mkdirSync(OUT, { recursive: true });

async function readPageState(page) {
  return page.evaluate(() => {
    const url = location.href;
    const body = document.body?.innerText ?? "";
    const overlayEls = [...document.querySelectorAll("[aria-live]")];
    const overlay =
      overlayEls.map((el) => el.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean)[0] ?? null;
    const lines = body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let finalNet = null;
    const idx = lines.findIndex((l) => l === "Final Net Profit");
    if (idx >= 0) {
      for (let i = idx + 1; i < Math.min(idx + 8, lines.length); i++) {
        if (/₽/.test(lines[i]) || /^-?[\d\s]+$/.test(lines[i])) {
          finalNet = lines[i];
          break;
        }
      }
    }
    return {
      url,
      overlay,
      finalNet,
      hasCashAfterTax: body.includes("Estimated Cash After Tax"),
      hasSettlementBreakdown: body.includes("Settlement Breakdown"),
      hasWbSettlement: body.includes("WB Settlement"),
      hasWildberriesTransfer: body.includes("Wildberries will transfer this amount"),
      hasModelB: body.includes("Model B"),
      hasCategoryBrand: /Profitability[\s\S]{0,200}Category[\s\S]{0,80}Brand/.test(body),
      hasTimeoutCopy: body.includes("Switch may still be loading"),
      companyOnPage: lines.find((l) => l === "Default Company" || l === "Orion Shop") ?? null,
    };
  });
}

async function waitSettled(page, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const body = await page.locator("body").innerText();
    if (body.includes("Switch may still be loading")) {
      return { ok: false, reason: "timeout overlay visible" };
    }
    const busy =
      body.includes("Switching account") ||
      body.includes("Loading dashboard") ||
      body.includes("Finalizing") ||
      body.includes("Dashboard updating");
    if (!busy) return { ok: true };
    await page.waitForTimeout(300);
  }
  return { ok: false, reason: "busy wait exceeded" };
}

async function companyTrigger(page, label) {
  // Tenant selector trigger — prefer exact label match among top controls.
  return page.locator("button.inline-flex.min-w-\\[160px\\]").filter({ hasText: label }).first();
}

async function selectCompany(page, currentLabel, nextLabel) {
  const trigger = await companyTrigger(page, currentLabel);
  await trigger.waitFor({ state: "visible", timeout: 60000 });
  await trigger.click();
  await page.waitForTimeout(500);
  // Dropdown panel options (label + accounts hint).
  const option = page
    .locator("div.absolute button")
    .filter({ hasText: nextLabel })
    .first();
  await option.waitFor({ state: "visible", timeout: 10000 });
  await option.click();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const report = { steps: [], pass: false };

  try {
    await page.goto(`${BASE}/?company=1&account=1&from=2026-06-17&to=2026-07-16`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await (await companyTrigger(page, "Default Company")).waitFor({
      state: "visible",
      timeout: 90000,
    });
    // Allow deferred WB strip to stream
    for (let i = 0; i < 60; i++) {
      const s = await readPageState(page);
      if (s.hasWbSettlement && s.finalNet) break;
      await page.waitForTimeout(1000);
    }

    let state1 = await readPageState(page);
    await page.screenshot({ path: resolve(OUT, "01-account1-top.png") });
    await page.locator("text=WB Settlement").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, "02-account1-settlement.png") });
    await page.locator("text=Profitability").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, "03-account1-profitability.png") });
    report.steps.push({ step: "account1_baseline", state: state1 });

    await page.evaluate(() => window.scrollTo(0, 0));
    await selectCompany(page, "Default Company", "Orion Shop");
    const overlay2 = await waitSettled(page, 30000);
    for (let i = 0; i < 60; i++) {
      const s = await readPageState(page);
      if (/account=2/.test(s.url) && s.finalNet && s.companyOnPage === "Orion Shop") break;
      await page.waitForTimeout(1000);
    }
    let state2 = await readPageState(page);
    await page.screenshot({ path: resolve(OUT, "04-after-switch-account2.png") });
    report.steps.push({ step: "switch_to_account2", overlay: overlay2, state: state2 });

    await selectCompany(page, "Orion Shop", "Default Company");
    const overlay3 = await waitSettled(page, 30000);
    for (let i = 0; i < 60; i++) {
      const s = await readPageState(page);
      if (/account=1/.test(s.url) && s.finalNet && s.companyOnPage === "Default Company") break;
      await page.waitForTimeout(1000);
    }
    let state3 = await readPageState(page);
    await page.screenshot({ path: resolve(OUT, "05-after-switch-back-account1.png") });
    report.steps.push({ step: "switch_back_account1", overlay: overlay3, state: state3 });

    const norm = (v) => (v ?? "").replace(/\s/g, "");
    const kpiChanged = Boolean(state1.finalNet && state2.finalNet && norm(state1.finalNet) !== norm(state2.finalNet));
    const kpiRestored = Boolean(state3.finalNet && state1.finalNet && norm(state3.finalNet) === norm(state1.finalNet));
    const urlOk =
      /company=2/.test(state2.url) &&
      /account=2/.test(state2.url) &&
      /company=1/.test(state3.url) &&
      /account=1/.test(state3.url);
    const noTimeout =
      overlay2.ok &&
      overlay3.ok &&
      !state2.hasTimeoutCopy &&
      !state3.hasTimeoutCopy;

    report.checks = {
      kpiChanged,
      kpiRestored,
      urlOk,
      noTimeoutOverlay: noTimeout,
      settlementVisibleA1:
        state1.hasWbSettlement && state1.hasCashAfterTax && state1.hasWildberriesTransfer,
      profitabilityVisibleA1: state1.hasModelB && state1.hasCategoryBrand,
      urls: { a1: state1.url, a2: state2.url, back: state3.url },
      kpis: { a1: state1.finalNet, a2: state2.finalNet, back: state3.finalNet },
      overlays: { toA2: overlay2, back: overlay3 },
    };

    report.pass =
      report.checks.kpiChanged &&
      report.checks.urlOk &&
      report.checks.noTimeoutOverlay &&
      report.checks.settlementVisibleA1 &&
      report.checks.profitabilityVisibleA1;

    writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.checks, null, 2));
    console.log(report.pass ? "PROOF_PASS" : "PROOF_FAIL");
    process.exit(report.pass ? 0 : 1);
  } catch (err) {
    report.error = String(err?.stack ?? err);
    writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.error(report.error);
    process.exit(2);
  } finally {
    await browser.close();
  }
}

main();
