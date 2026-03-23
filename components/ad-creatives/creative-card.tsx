'use client';

import { useState } from 'react';
import { Check, Eye, Heart, Trash2, Download } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { AdCreative } from '@/lib/ad-creatives/types';

interface CreativeCardProps {
  creative: AdCreative;
  onFavorite: () => void;
  onDelete: () => void;
  /** Opens the detail dialog (normal mode) or toggles selection (selection mode). */
  onClick: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpenDetail?: () => void;
}

export function CreativeCard({
  creative,
  onFavorite,
  onDelete,
  onClick,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onOpenDetail,
}: CreativeCardProps) {
  const [hovered, setHovered] = useState(false);

  const { confirm, dialog } = useConfirm({
    title: 'Delete creative',
    description: 'This creative will be permanently removed. This action cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirm();
    if (ok) onDelete();
  }

  function handleFavorite(e: React.MouseEvent) {
    e.stopPropagation();
    onFavorite();
  }

  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = creative.image_url;
    link.download = `creative-${creative.id}.png`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleCardClick() {
    if (selectionMode) onToggleSelect?.();
    else onClick();
  }

  function handleCheckboxClick(e: React.MouseEvent) {
    e.stopPropagation();
    onToggleSelect?.();
  }

  return (
    <>
      {dialog}
      <div
        className={`group relative rounded-xl bg-surface overflow-hidden cursor-pointer border transition-all hover:shadow-card-hover ${
          selected
            ? 'border-accent ring-2 ring-accent/50'
            : 'border-nativz-border hover:border-accent/40'
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleCardClick}
      >
        {selectionMode && (
          <button
            type="button"
            onClick={handleCheckboxClick}
            className={`absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md border shadow-md transition-colors cursor-pointer ${
              selected
                ? 'border-accent bg-accent text-white'
                : 'border-white/40 bg-black/55 text-white hover:bg-black/70'
            }`}
            aria-label={selected ? 'Deselect creative' : 'Select creative'}
            aria-pressed={selected}
          >
            {selected ? <Check size={16} strokeWidth={2.5} /> : null}
          </button>
        )}

        <img
          src={creative.image_url}
          alt={creative.on_screen_text?.headline || 'Ad creative'}
          className="w-full block"
          loading="lazy"
        />

        {selectionMode && onOpenDetail && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
            className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md border border-white/40 bg-black/55 text-white shadow-md hover:bg-black/70 transition-colors cursor-pointer"
            aria-label="View creative details"
          >
            <Eye size={15} />
          </button>
        )}

        {/* Hover overlay — hidden in selection mode to avoid clashing with bulk actions */}
        {!selectionMode && (
          <div
            className={`absolute inset-0 bg-black/60 flex items-center justify-center gap-3 transition-opacity duration-200 ${
              hovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <button
              onClick={handleFavorite}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors cursor-pointer"
              aria-label={creative.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart
                size={18}
                className={creative.is_favorite ? 'fill-red-500 text-red-500' : 'text-white'}
              />
            </button>
            <button
              onClick={handleDownload}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors cursor-pointer"
              aria-label="Download creative"
            >
              <Download size={18} className="text-white" />
            </button>
            <button
              onClick={handleDelete}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 hover:bg-red-500/40 transition-colors cursor-pointer"
              aria-label="Delete creative"
            >
              <Trash2 size={18} className="text-white" />
            </button>
          </div>
        )}

        {/* Favorite indicator (always visible when favorited) */}
        {creative.is_favorite && !hovered && !selectionMode && (
          <div className="absolute top-2 right-2">
            <Heart size={14} className="fill-red-500 text-red-500 drop-shadow-md" />
          </div>
        )}
      </div>
    </>
  );
}
