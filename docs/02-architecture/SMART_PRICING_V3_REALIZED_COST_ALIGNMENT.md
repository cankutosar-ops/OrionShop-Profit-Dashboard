# Smart Pricing V3 realized-cost alignment

This change affects forward pricing only. Financial Engine V4, Product Profit, reporting, Tax Engine, stored Finance and historical inventory are unchanged. No migration or production write is required.

## Input contract and decision

- Average selling price remains the last 30 days of completed Sales API sales. The dashboard report date picker does not change pricing inputs.
- The cost replay ends at the latest stored Finance `operation_date` in the account-scoped fetch. This avoids dividing published charges by later Sales rows while Finance publication lags.
- The default cost source searches SKU 30, 60 and 90 days; then category 30, 60 and 90 days; then account 30, 60 and 90 days. SKU requires at least 20 completed sales, category 50. A candidate with no charged logistics does not establish a zero-cost estimate. Explicit historical window controls still work.
- The same selected source/window supplies the existing Sales API spread fee percentage, charged logistics and storage. The fee definition itself is unchanged, pending the separate Marketplace Fee decision.
- Logistics and storage are quoted per **net successful unit** (`SALE units − RETURN units`). For logistics the UI splits charged cost into `charged logistics / SALE units` plus an expected return burden equal to `charged logistics / net units − charged logistics / SALE units`. This is an allocation of observed charges, not an extra invented return fee. Finance rows classified as `COMPENSATION`, including some `return_logistics` suffix rows, are excluded from this cost.
- Advertising uses the larger of the manual percentage and the latest 30-day product-attributed ads / net Sales percentage when at least 20 completed sales support that rate. Lower-volume SKUs keep the manual percentage. The manual control is a floor. No cross-account or article-only ad attribution is used.
- Product Cost remains the latest cost-history entry for that SKU. Forward tax remains 6% by default on estimated post-fee payout; this does not change V4's historical tax base. Acceptance and penalties are excluded from the forward formula pending evidence of recurring materiality. In the two acceptance SKUs, recent acceptance is about ₽17 and ₽21 per net unit (under 0.5% of selling price); adjustments and penalties are zero in the 30-day sample.

The resulting unit formula is `price × (1 − Sales API spread fee %) × (1 − forward tax %) − price × effective ads % − Product Cost − charged logistics/net successful units − storage/net successful units`. The recommended-price solver retains its closed form and is checked at 15%, 20% and a custom margin. The risk label additionally considers category/account fallback, sample size and a recent logistics spike. The expanded explanation states the selected source/window, cost-as-of date, sample, 30-day versus 90-day divergence, return allocation and ad floor.

## Read-only Account 2 evidence

All figures are RUB per unit unless indicated. This is an **in-sample diagnostic**, using persisted Account 2 Sales, Finance, Ads and Product Cost through 2026-09-20. The realized comparison is the V4 product formula for 2026-08-31 through 2026-09-20. It is not a forecast accuracy claim. Expected profit evaluates the existing 30-day gross-sale ASP as of September 20; the old column recreates the 90-day gross-sale cost assumption and 5% ads floor. The new column uses the source/window selection above. Actual uses Finance `for_pay`, net Product Cost, charged logistics, acceptance, ads and the historical finished-price tax base.

- `i8-80444`: 27 sales, 3 returns, 24 net units. Old expected **+726**, new **+271** (SKU 30d), realized **−21**. Absolute error falls from **747** to **292**. Charged logistics: 30d ₽15,979 / 39 sales = ₽410 per sale and **₽499 per net unit**; 90d was ₽203 per sale. Ads floor rises from 5% to observed 5.93%.
- `i8-80545`: 35 sales, 7 returns, 28 net units. Old **+889**, new **+317** (SKU 30d), realized **+108**. Error falls **781 → 209**. Charged logistics: 30d ₽20,909 / 40 sales = ₽523 per sale and **₽634 per net unit**; 90d was ₽173 per sale. Observed ads is below the 5% manual floor.
- `i8-80966` (profitable, lower volume): old **+921**, new **+770** (SKU 60d), realized **+620**. Error **301 → 150**.
- `i8-80968` (profitable, lower volume): old **+479**, new **+333** (SKU 60d), realized **+92**. Error **388 → 242**.
- `i8-80967` (return-bearing, low volume): old **+636**, new **+147** (category 30d; manual ads floor), realized **+455**. Error **182 → 308**; category fallback is conservative here and the risk label must make its lower confidence visible.
- `i8-NS001` (loss, very low volume, high return): old **−269**, new **−378** (category 30d), realized **−1,496**. Error **1,228 → 1,119**. The single net unit makes its realized result highly volatile.

Across these six sampled SKUs, summed absolute error falls about **36%**. For the two acceptance SKUs it falls about **67%**. Their new combined expected profit is about **₽15.4k** versus realized **₽2.5k**, so a material gap remains. `i8-80444` still has the wrong profit sign. The reusable bridge exposes price, Sales API fee, Sales-to-Finance settlement, base logistics, return burden, storage, Product Cost, ads, small marketplace costs and tax as separate deltas; its arithmetic residual is under one kopeck for both acceptance fixtures. The settlement delta is shown explicitly and is **not** silently converted into a new fee definition.

## Remaining gate

The canonical Marketplace Fee accounting definition has not been approved. The forward fee resolver is injectable, but its production default remains the existing Sales API `Net Sales − forPay` spread. Do not switch to Finance `ppvz_*` components or revise V4 as part of this change. The remaining expected-versus-realized gap, especially on `i8-80444`, cannot be declared resolved by this change alone. No deployment should occur before the separate fee decision and a fresh bounded acceptance check.
