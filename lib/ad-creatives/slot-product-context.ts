import type { AdGenerationConfig, OnScreenText, ProductOfferConfig } from './types';

/** Row from `config.products` for this slot (aligned with rotating product images when enabled). */
export function slotProductRow(
  itemIndex: number,
  config: AdGenerationConfig,
): ProductOfferConfig | null {
  const prods = config.products;
  if (!prods?.length) return null;
  const rotate = config.rotateProductImageUrls === true && prods.length > 1;
  const idx = rotate ? itemIndex % prods.length : 0;
  return prods[idx] ?? null;
}

/** On-screen text with per-product CTA when `config.products` supplies one for this slot. */
export function slotOnScreenText(
  base: OnScreenText,
  itemIndex: number,
  config: AdGenerationConfig,
): OnScreenText {
  const row = slotProductRow(itemIndex, config);
  const cta = row?.cta?.trim();
  if (cta) return { ...base, cta: cta.slice(0, 100) };
  return base;
}

/** Per-slot product summary and offer for image prompts and QA (wizard `products` + rotation). */
export function slotProductServiceOffer(
  itemIndex: number,
  config: AdGenerationConfig,
): { productService: string; offer: string | null } {
  const row = slotProductRow(itemIndex, config);
  const basePs = config.productService?.trim() || '';
  const baseOff = config.offer?.trim() || null;
  if (!row) {
    return { productService: basePs, offer: baseOff };
  }
  const nameDesc = [row.product.name, row.product.description].filter(Boolean).join(' — ').trim();
  const ps = nameDesc ? nameDesc.slice(0, 500) : basePs;
  const off = row.offer?.trim() || baseOff || null;
  return { productService: ps, offer: off };
}
