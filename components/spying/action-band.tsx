import Link from 'next/link';
import { Search, Radar } from 'lucide-react';

export function CompetitorIntelligenceActionBand() {
  return (
    <section
      className="grid animate-ci-rise grid-cols-1 gap-4 md:grid-cols-2"
      style={{ animationDelay: '200ms' }}
    >
      <ActionCard
        title="Run an audit"
        body="Deep-dive a brand across TikTok, Instagram and YouTube. Auto-discovers competitors. Delivers a scorecard in about four minutes."
        href="/admin/analyze-social"
        ctaLabel="Start audit"
        tone="primary"
        icon={<Search size={22} />}
      />
      <ActionCard
        title="Watch a competitor"
        body="Enrol a competitor profile into ongoing benchmarking. Snapshots refresh weekly, biweekly, or monthly. History lives in Analytics."
        href="/spying/watch"
        ctaLabel="Set up watch"
        tone="secondary"
        icon={<Radar size={22} />}
      />
    </section>
  );
}

function ActionCard({
  title,
  body,
  href,
  ctaLabel,
  tone,
  icon,
}: {
  title: string;
  body: string;
  href: string;
  ctaLabel: string;
  tone: 'primary' | 'secondary';
  icon: React.ReactNode;
}) {
  const iconTileClasses =
    tone === 'primary'
      ? 'bg-cyan-500/10 text-cyan-300 ring-1 ring-inset ring-cyan-500/20 group-hover:rotate-[8deg]'
      : 'bg-coral-500/10 text-coral-300 ring-1 ring-inset ring-coral-500/20 group-hover:scale-[1.08]';

  const ctaClasses =
    tone === 'primary'
      ? 'bg-accent text-white hover:bg-accent/90'
      : 'border border-cyan-500/40 text-cyan-200 hover:border-cyan-400 hover:bg-cyan-500/10';

  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-nativz-border bg-surface p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 16px 40px -24px rgba(0,0,0,0.6)' }}
    >
      <span
        className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full transition-transform duration-300 ${iconTileClasses}`}
      >
        {icon}
      </span>
      <h3
        className="mb-2 text-xl font-semibold text-text-primary"
        style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
      >
        {title}
      </h3>
      <p
        className="mb-6 text-sm leading-relaxed text-white/70"
        style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}
      >
        {body}
      </p>
      <span
        className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-[11px] font-semibold uppercase tracking-[2px] transition-colors ${ctaClasses}`}
        style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
      >
        {ctaLabel}
      </span>
    </Link>
  );
}
