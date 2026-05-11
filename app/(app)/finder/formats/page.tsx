import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveBrand } from '@/lib/active-brand';
import { Sparkles } from 'lucide-react';
import {
  VIRAL_FORMATS,
  ROW_LABELS,
  recommendedForBrand,
  type FormatRowCategory,
  type ViralFormat,
} from '@/lib/research/viral-formats';
import { FormatsExploreShell } from '@/components/research/formats-explore-shell';

export const dynamic = 'force-dynamic';

/**
 * /finder/formats — Netflix-style explore page for proven viral
 * short-form formats (NAT-64). Sibling to /finder/new under the
 * Trend Finder parent in the sidebar.
 *
 * For v0.1 the format library is hand-curated in
 * `lib/research/viral-formats.ts`. A future iteration moves it
 * into a `viral_formats` table with admin-side curation tools and
 * automated scoring against top short-form posts.
 */
export default async function ViralFormatsPage() {
  const active = await getActiveBrand().catch(() => null);

  // The "Recommended for [brand]" row needs the brand's industry to filter
  // formats. We pull industry + category off the active brand directly so
  // the row can fall back to category if industry is empty.
  let brandName: string | null = null;
  let brandIndustries: string[] = [];

  if (active?.brand) {
    brandName = active.brand.name;
    const admin = createAdminClient();
    const { data } = await admin
      .from('clients')
      .select('industry, category')
      .eq('id', active.brand.id)
      .maybeSingle();
    brandIndustries = [data?.industry, data?.category]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }

  // Build rows. "Recommended" sits at the top whenever a brand is pinned.
  // The remaining rows render every category that has at least one entry.
  const recommended = brandName ? recommendedForBrand(brandIndustries) : [];

  const rows: { category: FormatRowCategory; formats: ViralFormat[] }[] = [];
  if (recommended.length > 0) {
    rows.push({ category: 'recommended', formats: recommended });
  }

  const categoryOrder: FormatRowCategory[] = [
    'hooks',
    'education',
    'narrative',
    'pov',
    'transformation',
    'trends',
  ];
  for (const cat of categoryOrder) {
    const formats = VIRAL_FORMATS.filter((f) => f.category === cat);
    if (formats.length > 0) rows.push({ category: cat, formats });
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wide">
          <Sparkles size={14} className="accent-text" />
          Viral formats
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold text-text-primary">
          Scalable, repeatable short-form formats
        </h1>
        <p className="text-sm text-text-muted max-w-2xl">
          Browse winning structural patterns for short-form video. Every
          format is paired with a recreation playbook so a videographer
          knows exactly how to ship it for the active brand.
        </p>
      </header>

      <FormatsExploreShell
        rows={rows}
        rowLabels={ROW_LABELS}
        brandName={brandName}
      />
    </div>
  );
}
