/**
 * Potential Profit (No Returns) — Commercial Performance simulation validation.
 * Run: npm run verify:potential-profit-no-returns
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculatePotentialProfitNoReturns } from "../src/lib/potential-profit-no-returns.ts";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sha(rel) {
  return createHash("sha256").update(read(rel)).digest("hex").slice(0, 16);
}

console.log("=== Potential Profit (No Returns) — Simulation Validation ===\n");

console.log("--- Artifacts ---");
for (const rel of [
  "src/lib/potential-profit-no-returns.ts",
  "src/components/dashboard/dashboard-profit-section.tsx",
  "src/components/dashboard/metric-card.tsx",
]) {
  check(rel, existsSync(resolve(process.cwd(), rel)));
}

console.log("\n--- Isolation from Financial Engine ---");
const sim = read("src/lib/potential-profit-no-returns.ts");
const section = read("src/components/dashboard/dashboard-profit-section.tsx");
const engine = read("src/lib/profit-engine-model-b.ts");
const fe = read("src/lib/financial-engine.ts");
const dashSvc = read("src/services/dashboard-service.ts");

check(
  "Simulation lib does not import Financial Engine",
  !sim.includes("financial-engine") &&
    !sim.includes("profit-engine-model-b") &&
    !sim.includes("calculateModelB") &&
    !sim.includes("buildModelB")
);
check(
  "Simulation starts from Gross Sales (not Revenue)",
  sim.includes("grossSales") &&
    /grossSales\s*-/.test(sim.replace(/\s+/g, " ")) &&
    !/potentialProfit\s*=\s*[\s\S]*?\brevenue\b/.test(sim)
);
check(
  "Financial Engine file unchanged by this feature (content still present)",
  engine.includes("finalNetProfit") && fe.includes("buildCommercialPerformance")
);
check(
  "Dashboard service Net Profit path not rewritten for simulation",
  !dashSvc.includes("potential-profit-no-returns") &&
    !dashSvc.includes("calculatePotentialProfitNoReturns")
);

console.log("\n--- UI wiring ---");
check(
  "Net Profit still binds modelB.finalNetProfit",
  /title="Net Profit"[\s\S]*?modelB\.finalNetProfit/.test(section)
);
check(
  "Potential Profit widget present",
  section.includes("Potential Profit (No Returns)") &&
    section.includes("calculatePotentialProfitNoReturns")
);
check(
  "Return Profit Impact widget present",
  section.includes("Return Profit Impact") &&
    section.includes("returnProfitImpact")
);
check(
  "Marked as simulation",
  section.includes('badge="Simulation"') ||
    section.includes('badge="No Returns Scenario"')
);
check(
  "Margin subtitle uses Gross Sales base",
  section.includes("of Gross Sales") &&
    section.includes("marginPercentOfGrossSales")
);
check(
  "Simulation uses existing finalNetProfit only as currentNetProfit input",
  section.includes("currentNetProfit: modelB.finalNetProfit")
);

console.log("\n--- Pure formula ---");
const sample = calculatePotentialProfitNoReturns({
  grossSales: 100_000,
  marketplaceFee: 15_000,
  productCost: 40_000,
  logistics: 5_000,
  storage: 1_000,
  acceptance: 500,
  penalties: 200,
  adjustments: 800,
  advertising: 3_000,
  estimatedTax: 6_000,
  currentNetProfit: 20_000,
});
const expectedPotential =
  100_000 - 15_000 - 40_000 - 5_000 - 1_000 - 500 - 200 - 800 - 3_000 - 6_000;
check(
  "Potential Profit = Gross Sales − cost stack − Estimated Tax",
  sample.potentialProfit === expectedPotential,
  `${sample.potentialProfit} === ${expectedPotential}`
);
check(
  "Margin % based on Gross Sales",
  Math.abs(sample.marginPercentOfGrossSales - (expectedPotential / 100_000) * 100) < 1e-9,
  `${sample.marginPercentOfGrossSales}%`
);
check(
  "Return Profit Impact = Potential − Net Profit",
  sample.returnProfitImpact === expectedPotential - 20_000,
  `${sample.returnProfitImpact}`
);

const zeroGross = calculatePotentialProfitNoReturns({
  grossSales: 0,
  marketplaceFee: 0,
  productCost: 0,
  logistics: 0,
  storage: 0,
  acceptance: 0,
  penalties: 0,
  adjustments: 0,
  advertising: 0,
  estimatedTax: 0,
  currentNetProfit: 100,
});
check("Zero Gross Sales → margin 0", zeroGross.marginPercentOfGrossSales === 0);

console.log("\n--- Engine fingerprint (informational) ---");
console.log(`info  profit-engine-model-b.ts sha256[..16]=${sha("src/lib/profit-engine-model-b.ts")}`);
console.log(`info  financial-engine.ts sha256[..16]=${sha("src/lib/financial-engine.ts")}`);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
