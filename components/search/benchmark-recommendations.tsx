'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, BarChart3, Megaphone, Image } from 'lucide-react';
import { getVerticalRecommendations } from '@/lib/benchmarks/recommendations';
import type { VerticalRecommendations } from '@/lib/benchmarks/recommendations';

interface BenchmarkRecommendationsProps {
  industry: string;
}

export function BenchmarkRecommendations({ industry }: BenchmarkRecommendationsProps) {
  const [expanded, setExpanded] = useState(false);

  const recs = getVerticalRecommendations(industry);
  if (!recs) return null;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left cursor-pointer"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">
            Recommended ad formats for {recs.vertical}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            {expanded
              ? 'Based on Creative Benchmarks 2026 — $1.3B in ad spend across 578K ads'
              : `${recs.visualStyles.length} recommended formats for ${recs.vertical}`}
          </p>
        </div>
        <div className="shrink-0 ml-3 text-text-muted">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-nativz-border px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {/* Visual styles */}
            <VisualStylesSection styles={recs.visualStyles} />

            {/* Hook strategies */}
            <HooksSection hooks={recs.hooks} />

            {/* Asset types */}
            <AssetTypesSection assetTypes={recs.assetTypes} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Visual styles column ────────────────────────────────────────────────────

function VisualStylesSection({ styles }: { styles: VerticalRecommendations['visualStyles'] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <BarChart3 size={14} className="text-accent-text" />
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Visual styles</h4>
      </div>
      <div className="space-y-2">
        {styles.map((s) => (
          <div key={s.name} className="flex items-center justify-between rounded-lg bg-background px-3 py-2 border border-nativz-border/50">
            <span className="text-sm text-text-primary truncate mr-2">{s.name}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-text-muted">{s.hitRatePct}%</span>
              <SpendRatioBadge ratio={s.spendUseRatio} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Hooks column ────────────────────────────────────────────────────────────

function HooksSection({ hooks }: { hooks: VerticalRecommendations['hooks'] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <Megaphone size={14} className="text-accent2-text" />
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Hook strategies</h4>
      </div>
      <div className="space-y-2">
        {hooks.map((h) => (
          <div key={h.name} className="flex items-center justify-between rounded-lg bg-background px-3 py-2 border border-nativz-border/50">
            <span className="text-sm text-text-primary truncate mr-2">{h.name}</span>
            <span className="text-xs text-text-muted shrink-0">{h.hitRatePct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Asset types column ──────────────────────────────────────────────────────

function AssetTypesSection({ assetTypes }: { assetTypes: VerticalRecommendations['assetTypes'] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <Image size={14} className="text-emerald-400" />
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Asset types</h4>
      </div>
      <div className="space-y-2">
        {assetTypes.map((a) => (
          <div key={a.name} className="flex items-center justify-between rounded-lg bg-background px-3 py-2 border border-nativz-border/50">
            <span className="text-sm text-text-primary truncate mr-2">{a.name}</span>
            <span className="text-xs text-text-muted shrink-0">{a.hitRatePct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Spend use ratio badge ───────────────────────────────────────────────────

function SpendRatioBadge({ ratio }: { ratio: number }) {
  const isAbove = ratio >= 1.0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        isAbove
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-red-500/15 text-red-400'
      }`}
    >
      {ratio.toFixed(1)}x
    </span>
  );
}
