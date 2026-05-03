/**
 * PipelineView - 5-column "what's in motion" board.
 *
 * Renders the snapshot from `getDeliverablePipeline()`. Each column shows
 * the count + the list of cards. Empty columns get a soft "Nothing here"
 * line rather than disappearing - the columns themselves are the value
 * proposition (you can see what each stage looks like at a glance).
 *
 * Drag-and-drop is intentionally out of scope for v1: the buckets are
 * derived from existing fields, so dragging would imply a write path that
 * doesn't yet exist. Click-through to the deliverable detail will land in
 * a follow-up.
 */
import type { PipelineCard as PipelineCardData, PipelineSnapshot, PipelineBucket } from '@/lib/deliverables/get-pipeline';
import { PipelineCard } from './pipeline-card';

interface PipelineViewProps {
  snapshot: PipelineSnapshot;
  /** Map of editor user id -> {name, avatarUrl}. Optional (cards still render without it). */
  editorIndex?: Map<string, { name: string; avatarUrl: string | null }>;
}

const COLUMNS: Array<{ key: PipelineBucket; label: string; blurb: string }> = [
  { key: 'unstarted', label: 'Unstarted', blurb: 'Footage in, no cut yet' },
  { key: 'in_edit', label: 'In edit', blurb: 'First cut posted' },
  { key: 'in_review', label: 'In review', blurb: 'Awaiting your call' },
  { key: 'approved', label: 'Approved', blurb: 'Ready to publish' },
  { key: 'delivered', label: 'Delivered', blurb: 'Live on the feed' },
];

export function PipelineView({ snapshot, editorIndex }: PipelineViewProps) {
  const total = snapshot.cards.length;

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface p-6">
      <header className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          In flight
        </p>
        <h2 className="text-lg font-semibold text-text-primary">Production pipeline</h2>
        <p className="text-[13px] text-text-secondary">
          {total === 0
            ? 'Nothing in motion yet. Once footage lands, you will see it move through here.'
            : `${total} ${total === 1 ? 'deliverable' : 'deliverables'} in motion right now.`}
        </p>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map((col) => (
          <PipelineColumn
            key={col.key}
            label={col.label}
            blurb={col.blurb}
            count={snapshot.counts[col.key]}
            cards={snapshot.cards.filter((c) => c.bucket === col.key)}
            editorIndex={editorIndex}
          />
        ))}
      </div>
    </section>
  );
}

function PipelineColumn({
  label,
  blurb,
  count,
  cards,
  editorIndex,
}: {
  label: string;
  blurb: string;
  count: number;
  cards: PipelineCardData[];
  editorIndex?: Map<string, { name: string; avatarUrl: string | null }>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-text-primary">
            {label}
          </p>
          <p className="text-[10px] text-text-muted">{blurb}</p>
        </div>
        <span className="shrink-0 rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
          {count}
        </span>
      </div>
      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-nativz-border/60 px-3 py-4 text-center text-[11px] text-text-muted">
          Nothing here.
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map((c) => (
            <PipelineCard key={c.id} card={c} editorIndex={editorIndex} />
          ))}
        </div>
      )}
    </div>
  );
}
