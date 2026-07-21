"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { getWbProductThumbnailUrl } from "@/lib/wb-product-image";
import { cn } from "@/lib/utils";

type ProductThumbnailProps = {
  nmId: number | null | undefined;
  alt: string;
  size?: 40 | 48;
  className?: string;
};

/**
 * Small product thumb from WB CDN (nm_id). Lazy-loaded; placeholder on missing/error.
 */
export function ProductThumbnail({
  nmId,
  alt,
  size = 40,
  className,
}: ProductThumbnailProps) {
  const src = getWbProductThumbnailUrl(nmId);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 text-muted-foreground",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden={!showImage}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote WB CDN; sizes/lazy only
        <img
          src={src!}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          sizes={`${size}px`}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package className="h-4 w-4 opacity-60" strokeWidth={1.75} />
      )}
    </span>
  );
}
