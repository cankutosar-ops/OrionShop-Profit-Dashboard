import { expect, test } from "../../fixtures/base";
import { gotoDashboardReady } from "../../helpers/dashboard-nav";
import { waitForPageReady } from "../../helpers/wait-helpers";
import { annotateContract, contractTitle } from "./contract-metadata";

const KB_REF = "PH-01 / KB Implementation Compliance Audit / Sales";

test.describe("PH-01 Business Contracts · BC-003 Sales", () => {
  test(contractTitle({
    id: "BC-003",
    kbRef: KB_REF,
    page: "/inventory/warehouse-sales",
    reason: "Warehouse analytics must keep merchandise wording as Sales",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-003",
      kbRef: KB_REF,
      page: "/inventory/warehouse-sales",
      reason: "Warehouse analytics stays in Sales terminology",
    });

    await scopedPage.goto("/inventory/warehouse-sales");
    await waitForPageReady(scopedPage.page);
    await expect(scopedPage.page).toHaveURL(/\/inventory\/warehouse-sales/);
    await expect(
      scopedPage.page.getByRole("heading", { name: "Warehouse Sales Analytics" })
    ).toBeAttached();
    await expect(
      scopedPage.page.getByLabel("Warehouse sales summary").getByText("Orders Amount")
    ).toBeVisible();
    await expect(
      scopedPage.page.getByText(/\bSettlement Sales\b/i),
      "Settlement wording must not be represented under Sales labels"
    ).toHaveCount(0);
  });

  test(contractTitle({
    id: "BC-003",
    kbRef: KB_REF,
    page: "/",
    reason: "Dashboard merchandise trend must keep Sales naming",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-003",
      kbRef: KB_REF,
      page: "/",
      reason: "Dashboard card naming remains Sales (not Settlement Revenue)",
    });

    await gotoDashboardReady(scopedPage);

    await expect(
      scopedPage.page.getByRole("heading", { name: "Sales & Profit Trend" })
    ).toBeVisible();
  });
});
