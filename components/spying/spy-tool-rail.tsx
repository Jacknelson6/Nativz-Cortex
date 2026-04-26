import { History, LineChart, Store } from 'lucide-react';
import { SectionTile } from '@/components/admin/section-tabs';

export function SpyToolRail() {
  return (
    <section
      className="animate-ci-rise space-y-3"
      style={{ animationDelay: '420ms' }}
    >
      <div>
        <p
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/80"
          style={{ fontStyle: 'italic', fontFamily: 'Rubik, system-ui, sans-serif' }}
        >
          Adjacent
        </p>
        <h2
          className="mt-1 text-base font-semibold text-text-primary"
          style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
        >
          More spying tools
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SectionTile
          href="/admin/competitor-tracking/tiktok-shop"
          icon={<Store size={16} />}
          title="TikTok Shop tracker"
          primary="Top sellers, GMV, breakouts"
          secondary="Legacy view — still wired live"
        />
        <SectionTile
          href="/admin/analytics?tab=benchmarking"
          icon={<LineChart size={16} />}
          title="Benchmarking analytics"
          primary="Cross-platform deltas & charts"
        />
        <SectionTile
          href="/spying/audits"
          icon={<History size={16} />}
          title="Audit archive"
          primary="Every audit Cortex has run"
        />
      </div>
    </section>
  );
}
