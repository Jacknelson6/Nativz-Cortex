'use client';

import { BENCHMARK_SECTIONS } from '@/lib/benchmarks/sections';
import { BenchmarkCard } from '@/lib/benchmarks/charts/benchmark-card';
import { SpendTierTable } from '@/lib/benchmarks/charts/spend-tier-table';
import { PortfolioBreakdown } from '@/lib/benchmarks/charts/portfolio-breakdown';
import { SpendAllocation } from '@/lib/benchmarks/charts/spend-allocation';
import { TestingHeatmap } from '@/lib/benchmarks/charts/testing-heatmap';
import { Top25Comparison } from '@/lib/benchmarks/charts/top25-comparison';
import { VisualStylesTable } from '@/lib/benchmarks/charts/visual-styles-table';
import { VisualStylesVertical } from '@/lib/benchmarks/charts/visual-styles-vertical';
import { HooksHeadlinesTable } from '@/lib/benchmarks/charts/hooks-headlines-table';
import { AssetTypesTable } from '@/lib/benchmarks/charts/asset-types-table';
import type { BenchmarkConfig } from './types';

const CHART_COMPONENTS: Record<string, React.ComponentType<{ activeFilter?: string | null }>> = {
  'CH-003': SpendTierTable,
  'CH-005': PortfolioBreakdown,
  'CH-006': SpendAllocation,
  'CH-007': TestingHeatmap,
  'CH-008': Top25Comparison,
  'CH-009': VisualStylesTable,
  'CH-010': VisualStylesVertical,
  'CH-011': HooksHeadlinesTable,
  'CH-012': AssetTypesTable,
};

interface BenchmarksViewerProps {
  config: BenchmarkConfig;
  /** When set, only render this single section (for editor preview) */
  previewSectionId?: string | null;
  /** Optional className for the container */
  className?: string;
}

export function BenchmarksViewer({ config, previewSectionId, className = '' }: BenchmarksViewerProps) {
  const orderedSections = config.section_order
    .filter((id) => config.visible_sections.includes(id))
    .map((id) => BENCHMARK_SECTIONS.find((s) => s.id === id))
    .filter(Boolean);

  const sectionsToRender = previewSectionId
    ? orderedSections.filter((s) => s!.id === previewSectionId)
    : orderedSections;

  if (sectionsToRender.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-text-muted text-sm">No sections visible. Toggle sections on in the sidebar.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {sectionsToRender.map((section) => {
        const ChartComponent = CHART_COMPONENTS[section!.id];
        if (!ChartComponent) return null;
        return (
          <BenchmarkCard key={section!.id} section={section!}>
            <ChartComponent activeFilter={config.active_vertical_filter} />
          </BenchmarkCard>
        );
      })}
    </div>
  );
}
