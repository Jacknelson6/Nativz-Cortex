'use client';

import type { ComponentType } from 'react';
import type { BenchmarkSection } from './sections';
import { BenchmarkNarrative } from './charts/benchmark-narrative';
import { SpendTierTable } from './charts/spend-tier-table';
import { PortfolioBreakdown } from './charts/portfolio-breakdown';
import { SpendAllocation } from './charts/spend-allocation';
import { TestingHeatmap } from './charts/testing-heatmap';
import { Top25Comparison } from './charts/top25-comparison';
import { VisualStylesTable } from './charts/visual-styles-table';
import { VisualStylesVertical } from './charts/visual-styles-vertical';
import { HooksHeadlinesTable } from './charts/hooks-headlines-table';
import { AssetTypesTable } from './charts/asset-types-table';

const CHART_COMPONENTS: Record<
  string,
  ComponentType<{ activeFilter?: string | null }>
> = {
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

export function BenchmarkSectionBody({
  section,
  activeFilter = null,
}: {
  section: BenchmarkSection;
  activeFilter?: string | null;
}) {
  if (section.chartType === 'narrative') {
    return <BenchmarkNarrative section={section} />;
  }
  const Chart = CHART_COMPONENTS[section.id];
  if (!Chart) {
    return (
      <p className="text-sm text-text-muted">
        No chart component wired for {section.id}.
      </p>
    );
  }
  return <Chart activeFilter={activeFilter} />;
}
