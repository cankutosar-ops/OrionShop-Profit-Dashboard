import { expect, test } from "../../fixtures/base";
import { gotoDashboardReady } from "../../helpers/dashboard-nav";
import { waitForPageReady } from "../../helpers/wait-helpers";
import { annotateContract, contractTitle } from "./contract-metadata";

const KB_REF = "PH-01 / KB Implementation Compliance Audit / Revenue";

test.describe("PH-01 Business Contracts · BC-002 Revenue", () => {
  test(contractTitle({
    id: "BC-002",
    kbRef: KB_REF,
    page: "/",
    reason: "Merchandise trend chart must use Sales terminology, not Revenue",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-002",
      kbRef: KB_REF,
      page: "/",
      reason: "Dashboard trend naming remains Sales & Profit Trend",
    });

    await gotoDashboardReady(scopedPage);

    await expect(
      scopedPage.page.getByRole("heading", { name: "Sales & Profit Trend" })
    ).toBeVisible();
    await expect(
      scopedPage.page.getByText("Revenue & Profit Trend", { exact: false }),
      "Legacy Revenue terminology must not appear on dashboard trend card"
    ).toHaveCount(0);
  });

  test(contractTitle({
    id: "BC-002",
    kbRef: KB_REF,
    page: "/inventory/intelligence",
    reason: "Warehouse sales merchandise fields must not be labeled as Revenue",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-002",
      kbRef: KB_REF,
      page: "/inventory/intelligence",
      reason: "Merchandise figures in inventory intelligence keep Sales terminology",
    });

    await scopedPage.goto("/inventory/intelligence");
    await waitForPageReady(scopedPage.page);
    await expect(
      scopedPage.page.getByRole("heading", { name: "Inventory Intelligence" })
    ).toBeAttached();
    await expect(
      scopedPage.page.getByText(/\bTotal Revenue\b/i),
      "Total Revenue is forbidden for merchandise sales surfaces"
    ).toHaveCount(0);
  });
});
