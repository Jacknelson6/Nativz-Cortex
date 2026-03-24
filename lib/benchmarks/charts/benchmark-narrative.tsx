'use client';

import type { BenchmarkSection } from '../sections';
import {
  INTRO_HIGHLIGHTS,
  KEY_FINDINGS_BULLETS,
  CH001_BULLETS,
  CH002_BULLETS,
  CH004_BULLETS,
  CH004_TABLE,
} from '../narrative-content';

function BulletList({ items, large }: { items: string[]; large?: boolean }) {
  return (
    <ul className={`space-y-3 ${large ? 'text-base md:text-lg text-text-secondary' : 'text-sm text-text-secondary'}`}>
      {items.map((line) => (
        <li key={line} className="flex gap-2.5">
          <span className="text-accent-text shrink-0 mt-1">→</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function VolumeWinnersSchematic() {
  return (
    <div className="rounded-lg border border-nativz-border/80 bg-surface-hover/20 p-6 md:p-8">
      <p className="text-xs uppercase tracking-wider text-text-muted mb-4">Conceptual relationship (no point-level data)</p>
      <div className="relative h-48 md:h-56 flex items-end justify-center gap-8 md:gap-16">
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 md:w-20 h-24 md:h-32 rounded-t-md bg-gradient-to-t from-accent-text/20 to-accent-text/60" />
          <span className="text-xs text-text-muted text-center">Weekly volume ↑</span>
        </div>
        <div className="self-center text-text-muted text-2xl hidden sm:block">⇒</div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 md:w-20 h-32 md:h-44 rounded-t-md bg-gradient-to-t from-emerald-500/25 to-emerald-400/70" />
          <span className="text-xs text-text-muted text-center">Winner count ↑</span>
        </div>
      </div>
      <p className="text-xs text-text-muted/80 mt-4 text-center">
        Aggregate pattern from Motion Creative Benchmarks 2026 — individual advertisers not plotted.
      </p>
    </div>
  );
}

function SpendTailSchematic() {
  return (
    <div className="rounded-lg border border-nativz-border/80 bg-surface-hover/20 p-6">
      <p className="text-xs uppercase tracking-wider text-text-muted mb-3">Spend per creative (qualitative)</p>
      <div className="flex items-end gap-1 h-36 px-2">
        {[
          100, 72, 55, 44, 38, 32, 28, 24, 18, 14, 10, 8, 6, 5, 4, 3, 2, 2, 1, 1,
        ].map((h, i) => (
          <div
            key={i}
            className="flex-1 min-w-0 rounded-t-sm bg-amber-500/50 hover:bg-amber-400/70 transition-colors"
            style={{ height: `${h}%` }}
            title="Relative frequency (illustrative)"
          />
        ))}
      </div>
      <p className="text-xs text-text-muted mt-3">
        Illustrative long-tail shape only — exact distribution bins not published in the appendix.
      </p>
    </div>
  );
}

interface BenchmarkNarrativeProps {
  section: BenchmarkSection;
}

export function BenchmarkNarrative({ section }: BenchmarkNarrativeProps) {
  switch (section.id) {
    case 'CB26-INTRO':
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-accent-surface/40 border border-accent-text/20 py-4 px-2">
              <div className="text-2xl md:text-3xl font-bold text-accent-text">578,750</div>
              <div className="text-[10px] md:text-xs text-text-muted mt-1">Creatives</div>
            </div>
            <div className="rounded-lg bg-accent-surface/40 border border-accent-text/20 py-4 px-2">
              <div className="text-2xl md:text-3xl font-bold text-accent-text">$1.29B</div>
              <div className="text-[10px] md:text-xs text-text-muted mt-1">Realized spend</div>
            </div>
            <div className="rounded-lg bg-accent-surface/40 border border-accent-text/20 py-4 px-2">
              <div className="text-2xl md:text-3xl font-bold text-accent-text">6,015</div>
              <div className="text-[10px] md:text-xs text-text-muted mt-1">Advertisers</div>
            </div>
            <div className="rounded-lg bg-accent-surface/40 border border-accent-text/20 py-4 px-2">
              <div className="text-sm md:text-base font-bold text-accent-text leading-tight pt-1">Sep ’25 – Jan ’26</div>
              <div className="text-[10px] md:text-xs text-text-muted mt-1">Data window</div>
            </div>
          </div>
          <BulletList items={INTRO_HIGHLIGHTS} large />
        </div>
      );

    case 'CB26-KF':
      return (
        <div className="space-y-5">
          {KEY_FINDINGS_BULLETS.map((kf) => (
            <div
              key={kf.title}
              className="rounded-lg border border-nativz-border/60 bg-surface-hover/20 p-4"
            >
              <h4 className="text-sm font-semibold text-text-primary">{kf.title}</h4>
              <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{kf.detail}</p>
            </div>
          ))}
        </div>
      );

    case 'CH-001':
      return (
        <div className="space-y-6">
          <BulletList items={CH001_BULLETS} />
          <VolumeWinnersSchematic />
        </div>
      );

    case 'CH-002':
      return (
        <div className="space-y-6">
          <BulletList items={CH002_BULLETS} />
          <SpendTailSchematic />
        </div>
      );

    case 'CH-004':
      return (
        <div className="space-y-6">
          <BulletList items={CH004_BULLETS} />
          <div className="overflow-x-auto rounded-lg border border-nativz-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nativz-border/50 bg-surface-hover/30">
                  <th className="text-left py-3 px-3 text-text-muted font-medium">Account</th>
                  <th className="text-right py-3 px-3 text-text-muted font-medium">Launches</th>
                  <th className="text-right py-3 px-3 text-text-muted font-medium">Winners</th>
                  <th className="text-right py-3 px-3 text-text-muted font-medium">Hit rate</th>
                </tr>
              </thead>
              <tbody>
                {CH004_TABLE.map((row, i) => (
                  <tr key={row.account} className={i % 2 === 0 ? 'bg-surface-hover/15' : ''}>
                    <td className="py-3 px-3 text-text-primary">{row.account}</td>
                    <td className="py-3 px-3 text-right text-text-secondary">{row.launches}</td>
                    <td className="py-3 px-3 text-right text-text-secondary">{row.winners}</td>
                    <td className="py-3 px-3 text-right font-semibold text-emerald-400">{row.hitRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted">Hypothetical example only — no real account identifiers.</p>
        </div>
      );

    default:
      return (
        <p className="text-sm text-text-muted">No narrative content for {section.id}.</p>
      );
  }
}
