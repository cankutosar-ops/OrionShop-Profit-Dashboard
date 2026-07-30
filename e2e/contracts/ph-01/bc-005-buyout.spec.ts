import { expect, test } from "../../fixtures/base";
import { gotoDashboardReady } from "../../helpers/dashboard-nav";
import { waitForPageReady } from "../../helpers/wait-helpers";
import { annotateContract, contractTitle } from "./contract-metadata";

const KB_REF = "PH-01 / KB Implementation Compliance Audit / Buyout vs Purchase";

test.describe("PH-01 Business Contracts · BC-005 Buyout", () => {
  test(contractTitle({
    id: "BC-005",
    kbRef: KB_REF,
    page: "/",
    reason: "Customer funnel wording must use Buyout, never Purchases",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-005",
      kbRef: KB_REF,
      page: "/",
      reason: "Dashboard conversion chart remains Orders vs Buyout",
    });

    await gotoDashboardReady(scopedPage);

    await expect(
      scopedPage.page.getByRole("heading", { name: "Orders vs Buyout" })
    ).toBeVisible();
    await expect(
      scopedPage.page.getByText("Orders vs Purchases", { exact: false }),
      "Legacy Purchases wording must not appear in customer funnel surfaces"
    ).toHaveCount(0);
  });

  test(contractTitle({
    id: "BC-005",
    kbRef: KB_REF,
    page: "/purchases",
    reason: "Procurement module must keep Purchase terminology",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-005",
      kbRef: KB_REF,
      page: "/purchases",
      reason: "Purchasing module should remain procurement-specific",
    });

    await scopedPage.goto("/purchases");
    await waitForPageReady(scopedPage.page);
    await expect(scopedPage.page).toHaveURL(/\/purchases/);
    await expect(scopedPage.page.getByRole("heading", { name: "Purchases" })).toBeAttached();
    await expect(
      scopedPage.page.getByText(/\bBuyout\b/i),
      "Buyout terminology must not replace procurement module language"
    ).toHaveCount(0);
  });
});
