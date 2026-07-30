/**
 * Quick validation for universal table sort cycle (DESC → ASC → default).
 * Run: npx tsx scripts/validate-table-sort-cycle.ts
 */
import {
  cycleSortState,
  resolveSortSpec,
  sortRowsBySpec,
  type CycleSortState,
} from "../src/lib/ui/table-sort";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const def = { key: "revenue" as const, direction: "desc" as const };
let s: CycleSortState<"revenue" | "orders" | "warehouse"> = { kind: "default" };

// Default is revenue DESC → click revenue → ASC
s = cycleSortState(s, "revenue", def);
assert(s.kind === "active" && s.direction === "asc", `expected asc, got ${JSON.stringify(s)}`);

// ASC → clear to default
s = cycleSortState(s, "revenue", def);
assert(s.kind === "default", `expected default, got ${JSON.stringify(s)}`);
assert(resolveSortSpec(s, def)?.direction === "desc", "effective should be default desc");

// Other column from default → DESC
s = cycleSortState(s, "orders", def);
assert(s.kind === "active" && s.key === "orders" && s.direction === "desc", "orders desc");

s = cycleSortState(s, "orders", def);
assert(s.kind === "active" && s.direction === "asc", "orders asc");

s = cycleSortState(s, "orders", def);
assert(s.kind === "default", "back to default");

const rows = [
  { warehouse: "Beta", orders: 10, revenue: 100 },
  { warehouse: "Alpha", orders: 30, revenue: 50 },
  { warehouse: "Gamma", orders: 20, revenue: 200 },
];

assert(
  sortRowsBySpec(rows, { key: "warehouse", direction: "asc" }, (r, k) => r[k as keyof typeof r])
    .map((r) => r.warehouse)
    .join(",") === "Alpha,Beta,Gamma",
  "warehouse alpha"
);

assert(
  sortRowsBySpec(rows, { key: "orders", direction: "desc" }, (r, k) => r[k as keyof typeof r])
    .map((r) => r.orders)
    .join(",") === "30,20,10",
  "orders desc"
);

assert(
  sortRowsBySpec(rows, { key: "revenue", direction: "desc" }, (r, k) => r[k as keyof typeof r])
    .map((r) => r.revenue)
    .join(",") === "200,100,50",
  "revenue desc"
);

console.log("ALL_CYCLE_SORT_CHECKS_PASSED");
