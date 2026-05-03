/**
 * PipelineCard - one deliverable in the pipeline view.
 *
 * Compact card matching the calendar page's thumbnail density. Falls back
 * to a "no thumbnail" placeholder when the underlying drop video has no
 * `thumbnail_url`. Editor avatar surfaces only when attribution exists.
 */
import Image from 'next/image';
import { Film } from 'lucide-react';
import type { PipelineCard as PipelineCardData } from '@/lib/deliverables/get-pipeline';

interface PipelineCardProps {
  card: PipelineCardData;
  /** Map of editor user id -> initials/avatar url for attribution chips. */
  editorIndex?: Map<string, { name: string; avatarUrl: string | null }>;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const ageMs = Date.now() - d.getTime();
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function PipelineCard({ card, editorIndex }: PipelineCardProps) {
  const editor = card.editorUserId
    ? editorIndex?.get(card.editorUserId) ?? null
    : null;
  const headline = card.title ?? card.captionPreview ?? 'Untitled draft';

  return (
    <article className="group flex gap-3 rounded-xl border border-nativz-border/60 bg-background/40 p-2.5 transition-colors hover:border-nativz-border hover:bg-surface-hover">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-hover">
        {card.thumbnailUrl ? (
          <Image
            src={card.thumbnailUrl}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-tertiary">
            <Film size={18} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-text-primary">{headline}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-text-muted">
          <span>{relativeTime(card.updatedAt)}</span>
          {editor ? (
            <>
              <span aria-hidden>·</span>
              {editor.avatarUrl ? (
                <Image
                  src={editor.avatarUrl}
                  alt={editor.name}
                  width={14}
                  height={14}
                  className="rounded-full"
                  unoptimized
                />
              ) : (
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent-surface text-[8px] font-semibold uppercase text-accent-text">
                  {initialsFromName(editor.name) || '?'}
                </span>
              )}
              <span className="truncate">{editor.name}</span>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
