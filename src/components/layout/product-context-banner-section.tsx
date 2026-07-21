import { Suspense } from "react";
import { ProductContextBanner } from "@/components/layout/product-context-banner";

/** Suspense wrapper for product context banner on server pages. */
export function ProductContextBannerSection() {
  return (
    <Suspense fallback={null}>
      <ProductContextBanner />
    </Suspense>
  );
}
