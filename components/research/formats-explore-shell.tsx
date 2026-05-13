'use client';

import { useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import {
  type FormatRowCategory,
  type ViralFormat,
} from '@/lib/research/viral-formats';

interface RowLabelMap {
  [key: string]: { title: string; blurb: string };
}

interface Props {
  rows: { category: FormatRowCategory; formats: ViralFormat[] }[];
  rowLabels: RowLabelMap;
  brandName: string | null;
}

/**
 * Netflix-style horizontal-scroll explore page for viral short-form
 * formats. Each row is independently scrollable, with paddle controls
 * that fade in on hover. Card click opens a detail modal with the
 * full recreation playbook.
 */
export function FormatsExploreShell({ rows, rowLabels, brandName }: Props) {
  const [activeFormat, setActiveFormat] = useState<ViralFormat | null>(null);

  return (
    <div className="space-y-8">
      {rows.map(({ category, formats }) => {
        const labels = rowLabels[category];
        // The "Recommended" row's title carries the brand name when one
        // is pinned, so the personalization is visible at a glance.
        const title =
          category === 'recommended' && brandName
            ? `Recommended for ${brandName}`
            : labels.title;
        return (
          <FormatRow
            key={category}
            title={title}
            blurb={labels.blurb}
            formats={formats}
            onSelect={setActiveFormat}
          />
        );
      })}

      <FormatDetailModal
        format={activeFormat}
        onClose={() => setActiveFormat(null)}
      />
    </div>
  );
}

// ------------------------------------------------------------------ //
// Row
// ------------------------------------------------------------------ //

function FormatRow({
  title,
  blurb,
  formats,
  onSelect,
}: {
  title: string;
  blurb: string;
  formats: ViralFormat[];
  onSelect: (f: ViralFormat) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  function nudge(direction: 'left' | 'right') {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = el.clientWidth * 0.85 * (direction === 'left' ? -1 : 1);
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }

  return (
    <section className="group/row space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <p className="text-xs text-text-muted">{blurb}</p>
        </div>
        <div className="hidden md:flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => nudge('left')}
            aria-label="Scroll left"
            className="rounded-full border border-nativz-border bg-surface p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => nudge('right')}
            aria-label="Scroll right"
            className="rounded-full border border-nativz-border bg-surface p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
      >
        {formats.map((format) => (
          <FormatCard key={format.id} format={format} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ //
// Card
// ------------------------------------------------------------------ //

function FormatCard({
  format,
  onSelect,
}: {
  format: ViralFormat;
  onSelect: (f: ViralFormat) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(format)}
      className="snap-start shrink-0 w-[260px] md:w-[300px] text-left rounded-xl border border-nativz-border bg-surface p-4 transition-all hover:border-accent/60 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="rounded-md bg-surface-hover p-1.5 accent-text">
          <Sparkles size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary leading-tight">
            {format.title}
          </h3>
        </div>
      </div>
      <p className="text-xs text-text-muted line-clamp-3 mb-3">
        {format.description}
      </p>
      <div className="flex items-center gap-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1">
          <Clock size={12} />
          {format.durationSeconds}s
        </span>
        <span className="inline-flex items-center gap-1">
          <Layers size={12} />
          {complexityLabel(format.complexity)}
        </span>
      </div>
    </button>
  );
}

function complexityLabel(c: 1 | 2 | 3 | 4 | 5): string {
  if (c <= 1) return 'Phone-only';
  if (c === 2) return 'Light setup';
  if (c === 3) return 'Half-day shoot';
  if (c === 4) return 'Full-day shoot';
  return 'Multi-day shoot';
}

// ------------------------------------------------------------------ //
// Detail modal
// ------------------------------------------------------------------ //

function FormatDetailModal({
  format,
  onClose,
}: {
  format: ViralFormat | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!format}
      onClose={onClose}
      title=""
      maxWidth="2xl"
      bodyClassName="p-0"
    >
      {format && (
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-4 p-6 max-md:p-4 border-b border-nativz-border">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-text-muted text-xs uppercase tracking-wide mb-1">
                <Sparkles size={12} className="accent-text" />
                Format playbook
              </div>
              <h2 className="text-xl font-semibold text-text-primary">
                {format.title}
              </h2>
              <p className="text-sm text-text-muted mt-1">
                {format.description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <div className="p-6 space-y-5 max-md:p-4 max-md:space-y-4">
            <Meta format={format} />
            <Section heading="Example">
              <p className="text-sm text-text-primary leading-relaxed">
                {format.example}
              </p>
            </Section>
            <Section heading="Why it works">
              <p className="text-sm text-text-primary leading-relaxed">
                {format.whyItWorks}
              </p>
            </Section>
            <Section heading="How to recreate">
              <ol className="space-y-2">
                {format.recreationSteps.map((step, i) => (
                  <li
                    key={i}
                    className="flex gap-3 text-sm text-text-primary leading-relaxed"
                  >
                    <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface-hover text-[11px] font-semibold accent-text mt-0.5">
                      {i + 1}
                    </span>
                    <span className="flex-1">{step}</span>
                  </li>
                ))}
              </ol>
            </Section>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Meta({ format }: { format: ViralFormat }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Pill icon={Clock} label={`${format.durationSeconds}s`} />
      <Pill icon={Layers} label={complexityLabel(format.complexity)} />
      {format.industries.length === 0 ? (
        <Pill icon={Sparkles} label="Any niche" />
      ) : (
        format.industries.map((ind) => (
          <Pill key={ind} icon={Sparkles} label={ind} />
        ))
      )}
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
}: {
  icon: typeof Clock;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2.5 py-1 text-[11px] text-text-muted capitalize">
      <Icon size={12} />
      {label}
    </span>
  );
}

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-text-muted font-medium">
        {heading}
      </h3>
      {children}
    </div>
  );
}
