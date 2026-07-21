import {
  isOperationalMarketplaceAccount,
  filterOperationalMarketplaceAccounts,
} from "../src/lib/marketplace-account-visibility.ts";

const cases = [
  { account_name: "Wildberries Women", is_active: true, expect: true },
  { account_name: "Verify Flow Test", is_active: true, expect: false },
  { account_name: "Verify Flow Test 2", is_active: true, expect: false },
  { account_name: "Demo Store", is_active: true, expect: false },
  { account_name: "Sandbox WB", is_active: true, expect: false },
  { account_name: "Real Account", is_active: false, expect: false },
  { account_name: "Temporary Account", is_active: true, expect: false },
];

let pass = true;
for (const c of cases) {
  const got = isOperationalMarketplaceAccount(c);
  if (got !== c.expect) {
    console.log("FAIL", c.account_name, "got", got, "expected", c.expect);
    pass = false;
  }
}

const filtered = filterOperationalMarketplaceAccounts(
  cases.map(({ account_name, is_active }) => ({ account_name, is_active }))
);
console.log(
  "filtered names:",
  filtered.map((a) => a.account_name)
);
console.log(pass ? "VISIBILITY_PASS" : "VISIBILITY_FAIL");
process.exit(pass ? 0 : 1);
