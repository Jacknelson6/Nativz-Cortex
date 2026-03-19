'use client';

import type { BenchmarkSection } from '../sections';

interface BenchmarkCardProps {
  section: BenchmarkSection;
  children: React.ReactNode;
  className?: string;
}

export function BenchmarkCard({ section, children, className = '' }: BenchmarkCardProps) {
  return (
    <div className={`rounded-xl border border-nativz-border bg-surface p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-text-primary">{section.title}</h3>
      <p className="text-sm text-text-muted mt-1">{section.description}</p>
      <div className="mt-6">{children}</div>
      <div className="text-xs text-text-muted/60 mt-4 pt-3 border-t border-nativz-border/50">
        {section.source}
      </div>
    </div>
  );
}
