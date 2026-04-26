import { History, LineChart, ScanEye, Store, Swords } from 'lucide-react';
import { SectionTile } from '@/components/admin/section-tabs';

export function SpyToolRail() {
  return (
    <section
      className="animate-ci-rise space-y-3"
      style={{ animationDelay: '420ms' }}
    >
      <div>
        <p className="ui-eyebrow text-accent-text/80">Adjacent</p>
        <h2 className="mt-1 font-display text-base font-semibold text-text-primary">
          More spying tools
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <SectionTile
          href="/spying/self-audit"
          icon={<ScanEye size={16} />}
          title="Self-audit"
          primary="How AI describes you"
          secondary="Visibility + sentiment across Claude, GPT, Gemini"
        />
        <SectionTile
          href="/spying/versus"
          icon={<Swords size={16} />}
          title="Versus"
          primary="Head-to-head benchmark"
          secondary="Pick two audits, compare side-by-side"
        />
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
