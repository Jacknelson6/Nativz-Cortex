'use client';

import { BENCHMARK_SECTIONS } from '@/lib/benchmarks/sections';
import { BenchmarkCard } from '@/lib/benchmarks/charts/benchmark-card';
import { BenchmarkSectionBody } from '@/lib/benchmarks/benchmark-section-body';
import type { BenchmarkConfig } from './types';

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
      {sectionsToRender.map((section) => (
        <BenchmarkCard key={section!.id} section={section!}>
          <BenchmarkSectionBody
            section={section!}
            activeFilter={config.active_vertical_filter}
          />
        </BenchmarkCard>
      ))}
    </div>
  );
}
