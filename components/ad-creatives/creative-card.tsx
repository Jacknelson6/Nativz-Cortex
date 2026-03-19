'use client';

import { useState } from 'react';
import { Heart, Trash2, Download } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { AdCreative } from '@/lib/ad-creatives/types';

interface CreativeCardProps {
  creative: AdCreative;
  onFavorite: () => void;
  onDelete: () => void;
  onClick: () => void;
}

export function CreativeCard({ creative, onFavorite, onDelete, onClick }: CreativeCardProps) {
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

  return (
    <>
      {dialog}
      <div
        className="group relative rounded-xl bg-surface overflow-hidden cursor-pointer border border-nativz-border transition-all hover:border-accent/40 hover:shadow-card-hover"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onClick}
      >
        <img
          src={creative.image_url}
          alt={creative.on_screen_text?.headline || 'Ad creative'}
          className="w-full block"
          loading="lazy"
        />

        {/* Hover overlay */}
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

        {/* Favorite indicator (always visible when favorited) */}
        {creative.is_favorite && !hovered && (
          <div className="absolute top-2 right-2">
            <Heart size={14} className="fill-red-500 text-red-500 drop-shadow-md" />
          </div>
        )}
      </div>
    </>
  );
}
