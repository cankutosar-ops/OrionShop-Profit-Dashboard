import { expect, test } from "../../fixtures/base";
import { waitForPageReady } from "../../helpers/wait-helpers";
import { annotateContract, contractTitle } from "./contract-metadata";

const KB_REF = "PH-01 / KB Implementation Compliance Audit / Live Inventory vs Snapshot";

test.describe("PH-01 Business Contracts · BC-006 Live Inventory", () => {
  test(contractTitle({
    id: "BC-006",
    kbRef: KB_REF,
    page: "/inventory",
    reason: "Current inventory must not be presented as Snapshot",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-006",
      kbRef: KB_REF,
      page: "/inventory",
      reason: "Current inventory wording remains Live/Current state",
    });

    await scopedPage.goto("/inventory");
    await waitForPageReady(scopedPage.page);
    await expect(scopedPage.page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(
      scopedPage.page.getByText(/\bsnapshot\b/i),
      "Snapshot wording is forbidden on current inventory surfaces"
    ).toHaveCount(0);
  });

  test(contractTitle({
    id: "BC-006",
    kbRef: KB_REF,
    page: "/inventory/history",
    reason: "Historical inventory must remain a historical concept, not Live Inventory",
  }), async ({ scopedPage }, testInfo) => {
    annotateContract(testInfo, {
      id: "BC-006",
      kbRef: KB_REF,
      page: "/inventory/history",
      reason: "History page keeps historical wording separate from live state",
    });

    await scopedPage.goto("/inventory/history");
    await waitForPageReady(scopedPage.page);
    await expect(scopedPage.page.getByRole("heading", { name: "Inventory History" })).toBeVisible();
    await expect(
      scopedPage.page.getByText(/\bLive Inventory\b/i),
      "Live Inventory wording must not replace historical inventory language"
    ).toHaveCount(0);
  });
});
