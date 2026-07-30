import { expect, test } from "../../fixtures/base";
import { waitForPageReady } from "../../helpers/wait-helpers";
import { annotateContract, contractTitle } from "./contract-metadata";

const KB_REF = "PH-01 / KB Implementation Compliance Audit / Warehouse Sales vs Distribution";

test.describe("PH-01 Business Contracts · BC-004 Warehouse Sales", () => {
  test(contractTitle({
    id: "BC-004",
    kbRef: KB_REF,
    page: "/inventory/warehouse-sales",
    reason: "Warehouse Sales pages must never expose Distribution terminology",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-004",
      kbRef: KB_REF,
      page: "/inventory/warehouse-sales",
      reason: "Warehouse Sales remains separate from Distribution terminology",
    });

    await scopedPage.goto("/inventory/warehouse-sales");
    await waitForPageReady(scopedPage.page);
    await expect(scopedPage.page).toHaveURL(/\/inventory\/warehouse-sales/);
    await expect(scopedPage.page.getByRole("heading", { name: "Warehouse Sales Analytics" })).toBeAttached();
    await expect(
      scopedPage.page.getByText(/Warehouse Distribution/i),
      "Warehouse Distribution text must not appear on Warehouse Sales page"
    ).toHaveCount(0);
    await expect(scopedPage.page.getByText(/distribution/i)).toHaveCount(0);
  });

  test(contractTitle({
    id: "BC-004",
    kbRef: KB_REF,
    page: "/inventory/intelligence",
    reason: "Inventory intelligence drawer/panel must use Warehouse Sales wording",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-004",
      kbRef: KB_REF,
      page: "/inventory/intelligence",
      reason: "Warehouse sales labels remain consistent in intelligence surfaces",
    });

    await scopedPage.goto("/inventory/intelligence");
    await waitForPageReady(scopedPage.page);
    await expect(scopedPage.page).toHaveURL(/\/inventory\/intelligence/);
    await expect(scopedPage.page.getByRole("heading", { name: "Inventory Intelligence" })).toBeAttached();
    await expect(scopedPage.page.getByText(/Warehouse Distribution/i)).toHaveCount(0);
  });
});
