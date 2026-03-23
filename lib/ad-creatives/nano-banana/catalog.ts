import type { NanoBananaCatalogEntry } from './types';
import { NANO_BANANA_CATALOG } from './catalog-data';

export { NANO_BANANA_CATALOG } from './catalog-data';
export type { NanoBananaCatalogEntry, NanoBananaTypeGroup } from './types';
export { NANO_BANANA_TYPE_GROUPS } from './types';

const bySlug = new Map<string, NanoBananaCatalogEntry>(
  NANO_BANANA_CATALOG.map((e) => [e.slug, e]),
);

export function getNanoBananaBySlug(slug: string): NanoBananaCatalogEntry | undefined {
  return bySlug.get(slug);
}

export function assertValidNanoBananaSlugs(slugs: string[]): void {
  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    throw new Error(`Unknown Nano Banana slug(s): ${missing.join(', ')}`);
  }
}

export function listNanoBananaCatalog(): NanoBananaCatalogEntry[] {
  return [...NANO_BANANA_CATALOG].sort((a, b) => a.sortOrder - b.sortOrder);
}
