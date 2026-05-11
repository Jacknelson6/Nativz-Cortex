// SPY-01 T05: extract a prospect skeleton from a brand_audit or prospect_audit row.
// Pure function — no DB access. Caller owns the INSERT.

import type { ProspectPlatform, ProspectSource } from './types';

type AuditSource = 'brand_audit' | 'prospect_audit';

interface BrandAuditRow {
  id: string;
  brand_name: string | null;
  category: string | null;
}

interface ProspectAuditRow {
  id: string;
  tiktok_url: string | null;
  website_url: string | null;
  social_urls: unknown;
  prospect_data: unknown;
}

export interface ExtractedSocial {
  platform: ProspectPlatform;
  handle: string;
  profile_url: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
}

export interface ExtractedProspect {
  prospect: {
    brand_name: string;
    website_url: string | null;
    primary_platform: ProspectPlatform | null;
    primary_handle: string | null;
    niche: string | null;
    source: ProspectSource;
    source_ref_id: string;
  };
  socials: ExtractedSocial[];
}

const PLATFORM_HOSTS: Array<{ host: RegExp; platform: ProspectPlatform }> = [
  { host: /tiktok\.com/i, platform: 'tiktok' },
  { host: /instagram\.com/i, platform: 'instagram' },
  { host: /youtube\.com|youtu\.be/i, platform: 'youtube' },
  { host: /facebook\.com|fb\.com/i, platform: 'facebook' },
];

function inferPlatform(url: string | null): ProspectPlatform | null {
  if (!url) return null;
  for (const { host, platform } of PLATFORM_HOSTS) {
    if (host.test(url)) return platform;
  }
  return null;
}

function extractHandle(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0] ?? '';
    return seg.startsWith('@') ? seg : seg ? `@${seg}` : '';
  } catch {
    return '';
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function extractProspectFromBrandAudit(row: BrandAuditRow): ExtractedProspect {
  const brand = row.brand_name?.trim() || `Audit ${row.id.slice(0, 8)}`;
  return {
    prospect: {
      brand_name: brand,
      website_url: null,
      primary_platform: null,
      primary_handle: null,
      niche: row.category?.trim() || null,
      source: 'from_brand_audit',
      source_ref_id: row.id,
    },
    socials: [],
  };
}

export function extractProspectFromProspectAudit(row: ProspectAuditRow): ExtractedProspect {
  const data = asRecord(row.prospect_data) ?? {};
  const brandFromData = typeof data.brand_name === 'string' ? data.brand_name : null;
  const handleFromTiktok = row.tiktok_url ? extractHandle(row.tiktok_url) : null;
  const brand =
    brandFromData?.trim() ||
    (handleFromTiktok ? handleFromTiktok : null) ||
    `Prospect ${row.id.slice(0, 8)}`;

  const socials: ExtractedSocial[] = [];
  // tiktok_url is the canonical seed
  if (row.tiktok_url) {
    const platform = inferPlatform(row.tiktok_url) ?? 'tiktok';
    const handle = extractHandle(row.tiktok_url);
    if (handle) {
      socials.push({
        platform,
        handle,
        profile_url: row.tiktok_url,
        display_name: brandFromData ?? null,
        avatar_url: null,
        followers_count: null,
      });
    }
  }
  // social_urls may be an array of platform-tagged URL strings
  for (const entry of asArray(row.social_urls)) {
    const url = typeof entry === 'string' ? entry : asRecord(entry)?.url;
    if (typeof url !== 'string') continue;
    const platform = inferPlatform(url);
    if (!platform) continue;
    if (socials.some((s) => s.platform === platform)) continue;
    const handle = extractHandle(url);
    if (!handle) continue;
    socials.push({
      platform,
      handle,
      profile_url: url,
      display_name: null,
      avatar_url: null,
      followers_count: null,
    });
  }

  const primary = socials[0];

  return {
    prospect: {
      brand_name: brand,
      website_url: row.website_url ?? null,
      primary_platform: primary?.platform ?? null,
      primary_handle: primary?.handle ?? null,
      niche: typeof data.niche === 'string' ? data.niche : null,
      source: 'from_prospect_audit',
      source_ref_id: row.id,
    },
    socials,
  };
}

export function extractProspectFromAudit(args: {
  source: AuditSource;
  sourceRow: BrandAuditRow | ProspectAuditRow;
}): ExtractedProspect {
  return args.source === 'brand_audit'
    ? extractProspectFromBrandAudit(args.sourceRow as BrandAuditRow)
    : extractProspectFromProspectAudit(args.sourceRow as ProspectAuditRow);
}
