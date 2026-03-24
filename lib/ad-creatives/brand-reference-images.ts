import type { BrandContext } from '@/lib/knowledge/brand-context';

function isHttpUrl(s: string): boolean {
  try {
    const p = new URL(s);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Resolve relative logo paths (common in crawled DNA) against the client site. */
function absolutizeAssetUrl(raw: string, siteBase: string | undefined): string | null {
  const u = raw.trim();
  if (!u) return null;
  try {
    const abs = new URL(u);
    if (abs.protocol === 'http:' || abs.protocol === 'https:') return abs.href;
    return null;
  } catch {
    if (!siteBase?.trim()) return null;
    try {
      const abs = new URL(u, siteBase.trim());
      if (abs.protocol === 'http:' || abs.protocol === 'https:') return abs.href;
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** Up to 2 official logo URLs from Brand DNA — passed to the image model as explicit logo references. */
export function brandLogoImageUrlsForGeneration(ctx: BrandContext): string[] {
  const base = ctx.clientWebsiteUrl ?? undefined;
  const out: string[] = [];
  for (const l of ctx.visualIdentity.logos ?? []) {
    const resolved = absolutizeAssetUrl(l.url ?? '', base);
    if (!resolved || !isHttpUrl(resolved)) continue;
    if (!out.includes(resolved)) out.push(resolved);
    if (out.length >= 2) break;
  }
  return out;
}

/**
 * Uploaded brand assets + site screenshots (excluding URLs already sent as logos).
 * Capped for Gemini multimodal budget (see `generate-image.ts`).
 */
export function supplementaryBrandReferenceImageUrls(
  ctx: BrandContext,
  excludeLogoUrls: readonly string[],
): string[] {
  const base = ctx.clientWebsiteUrl ?? undefined;
  const ex = new Set(excludeLogoUrls.filter(Boolean));
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const resolved = raw ? absolutizeAssetUrl(raw, base) : null;
    if (!resolved || ex.has(resolved) || !isHttpUrl(resolved)) return;
    if (!out.includes(resolved)) out.push(resolved);
  };
  for (const u of ctx.creativeReferenceImageUrls ?? []) push(u);
  for (const s of ctx.visualIdentity.screenshots ?? []) push(s.url);
  return out.slice(0, 5);
}
