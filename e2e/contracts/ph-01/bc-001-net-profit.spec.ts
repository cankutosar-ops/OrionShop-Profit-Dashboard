import { expect, test } from "../../fixtures/base";
import { gotoDashboardReady } from "../../helpers/dashboard-nav";
import { waitForPageReady } from "../../helpers/wait-helpers";
import { annotateContract, contractTitle } from "./contract-metadata";

const KB_REF = "PH-01 / KB Implementation Compliance Audit / Net Profit";

test.describe("PH-01 Business Contracts · BC-001 Net Profit", () => {
  test(contractTitle({
    id: "BC-001",
    kbRef: KB_REF,
    page: "/products",
    reason: "\"Net Profit\" label must never represent Operating Profit",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-001",
      kbRef: KB_REF,
      page: "/products",
      reason: "Net Profit surfaces in Product Profitability remain canonical",
    });

    await scopedPage.goto("/products");
    await waitForPageReady(scopedPage.page);
    await expect(scopedPage.page.getByRole("button", { name: "Net Profit" })).toBeVisible();
    await expect(
      scopedPage.page.getByText("Operating Profit", { exact: false }),
      "Operating Profit must not be presented as Net Profit on /products"
    ).toHaveCount(0);
  });

  test(contractTitle({
    id: "BC-001",
    kbRef: KB_REF,
    page: "/audit/product-profitability",
    reason: "Audit table Net Profit must map to canonical Net Profit",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-001",
      kbRef: KB_REF,
      page: "/audit/product-profitability",
      reason: "Audit surface keeps Net Profit terminology canonical",
    });

    await scopedPage.goto("/audit/product-profitability");
    await waitForPageReady(scopedPage.page);
    await expect(
      scopedPage.page.getByRole("heading", { name: "Product Profitability Audit" })
    ).toBeAttached();
    await expect(scopedPage.page.getByRole("columnheader", { name: "Net Profit" })).toBeVisible();
    await expect(
      scopedPage.page.getByText("Operating Profit", { exact: false }),
      "Operating Profit must not be labeled as Net Profit in audit surfaces"
    ).toHaveCount(0);
  });

  test(contractTitle({
    id: "BC-001",
    kbRef: KB_REF,
    page: "/",
    reason: "Dashboard must keep Operating Profit and Net Profit explicitly separated",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-001",
      kbRef: KB_REF,
      page: "/",
      reason: "Dashboard continues explicit separation: Operating Profit vs Net Profit",
    });

    await gotoDashboardReady(scopedPage);

    // MetricCard titles — exact match; business meaning unchanged.
    await expect(scopedPage.page.getByText("Operating Profit", { exact: true }).first()).toBeVisible();
    await expect(scopedPage.page.getByText("Net Profit", { exact: true }).first()).toBeVisible();
  });
});
