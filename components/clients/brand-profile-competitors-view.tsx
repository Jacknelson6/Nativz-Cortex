'use client';

import { useEffect, useState } from 'react';
import { Globe, ExternalLink, Instagram, Facebook, Youtube, Sparkles } from 'lucide-react';

// Portal-facing read-only mirror of CompetitorsSection. Clients see the
// competitor list their Nativz team has curated for them. Adding/
// removing is admin-only.

type Platform = 'instagram' | 'tiktok' | 'facebook' | 'youtube';

const PLATFORM_ICON: Record<Platform, React.ElementType> = {
  instagram: Instagram,
  tiktok: Sparkles,
  facebook: Facebook,
  youtube: Youtube,
};

interface Handle {
  handle: string;
  profile_url: string | null;
}

interface Competitor {
  id: string;
  brand_name: string;
  website_url: string | null;
  notes: string | null;
  handles: Record<Platform, Handle | null>;
}

export function BrandProfileCompetitorsView({ clientId }: { clientId: string }) {
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/competitors`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setCompetitors(data.competitors);
      } catch (err) {
        console.error('BrandProfileCompetitorsView: fetch failed', err);
        if (!cancelled) setError('Could not load competitors');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-6">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-base font-semibold text-text-primary">Competitors we&apos;re watching</h3>
      </div>
      <p className="text-xs text-text-muted leading-relaxed mb-4">
        Brands we compare your performance against. Your Nativz team
        maintains this list.
      </p>

      {error ? (
        <p className="text-sm text-text-muted italic">{error}</p>
      ) : !competitors ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : competitors.length === 0 ? (
        <p className="text-sm text-text-muted italic">
          No competitors tracked yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {competitors.map((c) => (
            <CompetitorCard key={c.id} competitor={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function CompetitorCard({ competitor }: { competitor: Competitor }) {
  const linkedPlatforms = (['instagram', 'tiktok', 'facebook', 'youtube'] as Platform[]).filter(
    (p) => competitor.handles[p] !== null,
  );
  return (
    <div className="rounded-lg border border-nativz-border bg-background/30 px-3 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-medium text-text-primary truncate">{competitor.brand_name}</span>
        {competitor.website_url && (
          <a
            href={competitor.website_url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-accent-text hover:underline flex items-center gap-0.5"
          >
            <Globe size={10} /> <ExternalLink size={10} />
          </a>
        )}
      </div>
      {linkedPlatforms.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {linkedPlatforms.map((p) => {
            const Icon = PLATFORM_ICON[p];
            const h = competitor.handles[p];
            if (!h) return null;
            return (
              <a
                key={p}
                href={h.profile_url ?? '#'}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
              >
                <Icon size={10} /> @{h.handle}
              </a>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-text-muted italic">No handles linked</p>
      )}
    </div>
  );
}
