import Link from 'next/link';
import { Radar, ArrowUpRight } from 'lucide-react';

export function SpyingPageHeader() {
  return (
    <header
      className="animate-ci-rise flex flex-wrap items-end justify-between gap-4"
      style={{ animationDelay: '0ms' }}
    >
      <div>
        <p
          className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300/80"
          style={{ fontStyle: 'italic', fontFamily: 'Rubik, system-ui, sans-serif' }}
        >
          Competitor intelligence
        </p>
        <h1 className="ui-page-title mt-1">Spying</h1>
      </div>
      <Link
        href="/spying/watch"
        className="group inline-flex items-center gap-2 rounded-full border border-nativz-border bg-surface/70 px-3 py-1.5 text-xs text-text-secondary backdrop-blur transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
      >
        <Radar size={13} />
        Set up watch
        <ArrowUpRight size={12} className="opacity-60 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </header>
  );
}
