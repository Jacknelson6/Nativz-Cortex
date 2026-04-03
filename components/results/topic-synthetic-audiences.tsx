'use client';

import { useMemo, useState } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { TooltipCard } from '@/components/ui/tooltip-card';
import type { OceanScores, SyntheticAudiences, SyntheticAudienceSegment } from '@/lib/types/search';

const TRAIT_ROWS: { key: keyof OceanScores; label: string }[] = [
  { key: 'openness', label: 'Openness' },
  { key: 'conscientiousness', label: 'Conscientiousness' },
  { key: 'extraversion', label: 'Extraversion' },
  { key: 'agreeableness', label: 'Agreeableness' },
  { key: 'neuroticism', label: 'Neuroticism' },
];

const BLOB_GRADIENTS = [
  'from-blue-500/35 via-sky-400/10 to-transparent',
  'from-violet-500/30 via-fuchsia-500/10 to-transparent',
  'from-amber-500/25 via-orange-400/10 to-transparent',
  'from-emerald-500/28 via-teal-500/10 to-transparent',
];

function oceanToChartData(ocean: OceanScores) {
  return TRAIT_ROWS.map((row) => ({
    trait: row.label,
    value: ocean[row.key],
  }));
}

function segmentNarrative(seg: SyntheticAudienceSegment): string {
  if (seg.description?.trim()) return seg.description.trim();
  if (seg.rationale?.trim()) return seg.rationale.trim();
  return '';
}

interface TopicSyntheticAudiencesProps {
  data: SyntheticAudiences;
}

export function TopicSyntheticAudiences({ data }: TopicSyntheticAudiencesProps) {
  const segments = data.segments ?? [];
  const [selectedIdx, setSelectedIdx] = useState(0);

  const selected = segments[selectedIdx];
  const radarData = useMemo(
    () => (selected ? oceanToChartData(selected.ocean) : []),
    [selected],
  );

  if (segments.length === 0) return null;

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-4 sm:p-5 shadow-[var(--shadow-card)]">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-text-primary">Audience personas</h2>
        <p className="mt-1 text-sm text-text-muted">
          Modelled ICP-style segments and personality profiles for this topic — not survey or census data.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          The{' '}
          <a
            href="https://buzzabout.ai/blog/what-is-ocean-(big-five)-personality-model"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-text underline-offset-2 hover:underline"
          >
            OCEAN (Big Five) model
          </a>{' '}
          maps personality along openness, conscientiousness, extraversion, agreeableness, and neuroticism — five broad dimensions from decades of psychology research, often used for psychographic segmentation in marketing.
        </p>
        {data.intro ? <p className="mt-2 text-sm leading-relaxed text-text-secondary">{data.intro}</p> : null}
      </div>

      <div className="mb-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">Personas</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {segments.map((seg, idx) => {
            const narrative = segmentNarrative(seg);
            const tags = seg.interest_tags ?? [];
            const blob = BLOB_GRADIENTS[idx % BLOB_GRADIENTS.length];
            const isSelected = idx === selectedIdx;
            return (
              <button
                key={`${seg.name}-${idx}`}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`relative overflow-hidden rounded-xl border bg-background/50 p-4 text-left transition-colors ${
                  isSelected
                    ? 'border-accent/50 ring-1 ring-accent/30 shadow-[var(--shadow-card)]'
                    : 'border-nativz-border/80 hover:border-nativz-border hover:bg-background/70'
                }`}
              >
                <div
                  className={`pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-gradient-to-br ${blob} blur-2xl`}
                  aria-hidden
                />
                <div className="relative flex items-start justify-between gap-3">
                  <span className="text-2xl leading-none" aria-hidden>
                    {seg.emoji}
                  </span>
                  <span className="shrink-0 rounded-md bg-surface-hover px-2 py-0.5 text-xs font-medium tabular-nums text-text-muted">
                    {seg.share_percent}%
                  </span>
                </div>
                <h3 className="relative mt-3 text-sm font-semibold leading-snug text-text-primary">
                  {seg.name}
                </h3>
                {narrative ? (
                  <p className="relative mt-2 text-sm leading-relaxed text-text-secondary">{narrative}</p>
                ) : null}
                {tags.length > 0 ? (
                  <div className="relative mt-3 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-nativz-border/80 bg-surface/60 px-2.5 py-0.5 text-xs text-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-nativz-border/80 bg-background/40 p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
          <span>OCEAN distribution</span>
          {selected ? (
            <span className="font-normal normal-case text-text-secondary">— {selected.name}</span>
          ) : null}
          <TooltipCard
            title="Big Five (OCEAN)"
            description="The five factors: openness (curiosity vs. routine), conscientiousness (discipline vs. spontaneity), extraversion (sociability vs. reserve), agreeableness (cooperation vs. skepticism), neuroticism (stress reactivity vs. calm). Scores here are modelled for messaging, not diagnoses. Use the link in the section intro for a fuller overview."
          >
            <span className="sr-only">Help</span>
          </TooltipCard>
        </div>
        <div className="min-h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%" minHeight={220}>
            <RadarChart
              cx="50%"
              cy="50%"
              outerRadius="70%"
              data={radarData}
              margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <PolarGrid stroke="#3f3f46" strokeOpacity={0.5} />
              <PolarAngleAxis
                dataKey="trait"
                tick={{ fill: '#a1a1aa', fontSize: 10 }}
                tickLine={false}
              />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name="Score"
                dataKey="value"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.35}
                strokeWidth={1.5}
              />
              <Tooltip
                formatter={(value: number | string | undefined) => [
                  value === undefined ? '—' : `${value}%`,
                  '',
                ]}
                contentStyle={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--nativz-border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        {selected?.rationale && selected.description?.trim() ? (
          <p className="mt-3 border-t border-nativz-border/60 pt-3 text-xs leading-relaxed text-text-muted">
            <span className="font-medium text-text-secondary">Research tie-in: </span>
            {selected.rationale}
          </p>
        ) : null}
      </div>
    </section>
  );
}
