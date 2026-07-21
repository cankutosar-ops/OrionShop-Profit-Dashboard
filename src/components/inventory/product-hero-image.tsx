"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import {
  getWbProductLargeImageUrl,
  getWbProductThumbnailUrl,
} from "@/lib/wb-product-image";
import { cn } from "@/lib/utils";

type ProductHeroImageProps = {
  nmId: number | null | undefined;
  alt: string;
  className?: string;
};

/**
 * Product hero for the Intelligence drawer.
 *
 * Image origin (same as table thumbnails):
 *   products.nm_id → public WB CDN URL via getWbProductLargeImageUrl
 * No DB image column, no extra query, no WB API call.
 */
export function ProductHeroImage({ nmId, alt, className }: ProductHeroImageProps) {
  const largeSrc = getWbProductLargeImageUrl(nmId);
  const thumbSrc = getWbProductThumbnailUrl(nmId);
  const preferredSrc = largeSrc ?? thumbSrc;

  const [src, setSrc] = useState<string | null>(preferredSrc);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSrc(preferredSrc);
    setFailed(false);
    setLoaded(false);
  }, [preferredSrc, nmId]);

  const showImage = Boolean(src) && !failed;

  function handleError() {
    // Fall back to the same thumbnail URL the table already uses.
    if (src && largeSrc && src === largeSrc && thumbSrc && thumbSrc !== src) {
      setSrc(thumbSrc);
      setLoaded(false);
      return;
    }
    setFailed(true);
  }

  return (
    <div
      className={cn(
        // Fixed aspect box prevents layout shift while the CDN image loads.
        "relative flex aspect-[3/4] w-full max-w-[220px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40 text-muted-foreground",
        className
      )}
      aria-hidden={!showImage}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote WB CDN; eager for drawer hero
        <img
          src={src!}
          alt={alt}
          width={440}
          height={586}
          loading="eager"
          decoding="async"
          sizes="220px"
          className={cn(
            "h-full w-full object-contain object-center transition-opacity duration-200",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setLoaded(true)}
          onError={handleError}
        />
      ) : (
        <Package className="h-10 w-10 opacity-50" strokeWidth={1.5} />
      )}
    </div>
  );
}
