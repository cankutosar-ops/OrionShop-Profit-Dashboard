/**
 * Build a public Wildberries CDN thumbnail URL from products.nm_id.
 * No server API — presentation helper only. Callers must handle load errors.
 */

/** Basket host suffix from volume (nmId / 100000). Ranges follow WB CDN layout. */
function wbBasketHost(vol: number): string {
  let basket: number;
  if (vol <= 143) basket = 1;
  else if (vol <= 287) basket = 2;
  else if (vol <= 431) basket = 3;
  else if (vol <= 719) basket = 4;
  else if (vol <= 1007) basket = 5;
  else if (vol <= 1061) basket = 6;
  else if (vol <= 1115) basket = 7;
  else if (vol <= 1169) basket = 8;
  else if (vol <= 1313) basket = 9;
  else if (vol <= 1601) basket = 10;
  else if (vol <= 1655) basket = 11;
  else if (vol <= 1919) basket = 12;
  else if (vol <= 2045) basket = 13;
  else if (vol <= 2189) basket = 14;
  else if (vol <= 2405) basket = 15;
  else if (vol <= 2621) basket = 16;
  else if (vol <= 2837) basket = 17;
  else if (vol <= 3053) basket = 18;
  else if (vol <= 3269) basket = 19;
  else if (vol <= 3485) basket = 20;
  else basket = 21;

  return `basket-${String(basket).padStart(2, "0")}.wbbasket.ru`;
}

function wbProductImageBase(nmId: number | null | undefined): {
  host: string;
  vol: number;
  part: number;
  id: number;
} | null {
  if (nmId == null || !Number.isFinite(nmId) || nmId <= 0) return null;
  const id = Math.trunc(nmId);
  const vol = Math.floor(id / 100_000);
  const part = Math.floor(id / 1_000);
  return { host: wbBasketHost(vol), vol, part, id };
}

/**
 * Thumbnail URL for a product nm_id, or null when nm_id is missing/invalid.
 * Prefer small CDN size for table rows (c246x328).
 */
export function getWbProductThumbnailUrl(nmId: number | null | undefined): string | null {
  const base = wbProductImageBase(nmId);
  if (!base) return null;
  return `https://${base.host}/vol${base.vol}/part${base.part}/${base.id}/images/c246x328/1.webp`;
}

/**
 * Largest commonly available WB CDN still (images/big) — for drawer / Product 360° header.
 * Same basket/path rules as the thumbnail helper; callers must handle load errors.
 */
export function getWbProductLargeImageUrl(nmId: number | null | undefined): string | null {
  const base = wbProductImageBase(nmId);
  if (!base) return null;
  return `https://${base.host}/vol${base.vol}/part${base.part}/${base.id}/images/big/1.webp`;
}
