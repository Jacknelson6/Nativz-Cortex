'use client';

import { useState, useCallback } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Link2, Film, Image as ImageIcon, Globe } from 'lucide-react';
import { detectLinkType, linkTypeToItemType, type DetectedLinkType } from '@/lib/types/moodboard';
import { toast } from 'sonner';

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  onItemAdded: () => void;
}

const TYPE_LABELS: Record<DetectedLinkType, { label: string; icon: React.ReactNode; color: string }> = {
  youtube: { label: 'YouTube video', icon: <Film size={12} />, color: 'text-red-400' },
  tiktok: { label: 'TikTok video', icon: <Film size={12} />, color: 'text-pink-400' },
  instagram: { label: 'Instagram reel', icon: <Film size={12} />, color: 'text-purple-400' },
  facebook: { label: 'Facebook reel', icon: <Film size={12} />, color: 'text-blue-400' },
  twitter: { label: 'Twitter/X video', icon: <Film size={12} />, color: 'text-gray-400' },
  direct_video: { label: 'Direct video', icon: <Film size={12} />, color: 'text-blue-400' },
  image: { label: 'Image', icon: <ImageIcon size={12} />, color: 'text-green-400' },
  website: { label: 'Website', icon: <Globe size={12} />, color: 'text-cyan-400' },
};

export function AddItemModal({ open, onClose, boardId, onItemAdded }: AddItemModalProps) {
  const [url, setUrl] = useState('');
  const [detectedType, setDetectedType] = useState<DetectedLinkType | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUrlChange = useCallback((val: string) => {
    setUrl(val);
    if (val.trim() && isValidUrl(val.trim())) {
      setDetectedType(detectLinkType(val.trim()));
    } else {
      setDetectedType(null);
    }
  }, []);

  function isValidUrl(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || !isValidUrl(trimmed)) {
      toast.error('Enter a valid URL');
      return;
    }

    setLoading(true);
    try {
      const linkType = detectLinkType(trimmed);
      const itemType = linkTypeToItemType(linkType);

      console.log('Adding item:', { url: trimmed, type: itemType, linkType });

      const res = await fetch('/api/moodboard/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId,
          url: trimmed,
          type: itemType,
          position_x: 100 + Math.random() * 400,
          position_y: 100 + Math.random() * 300,
        }),
      });

      console.log('Response status:', res.status);
      
      if (!res.ok) {
        const data = await res.json();
        console.error('API error:', data);
        throw new Error(data.error || data.details || 'Failed to add item');
      }

      toast.success('Item added to board');
      setUrl('');
      setDetectedType(null);
      onItemAdded();
      onClose();
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { setUrl(''); setDetectedType(null); onClose(); }}
      title="Add item"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="item-url" className="block text-xs font-medium text-text-muted mb-1.5">
            Paste a link or URL
          </label>
          <Input
            id="item-url"
            placeholder="https://youtube.com/watch?v=... or any URL"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            autoFocus
          />
        </div>

        {/* Type detection indicator */}
        {detectedType && (
          <div className="flex items-center gap-2 text-xs animate-fade-in">
            <span className={`flex items-center gap-1 ${TYPE_LABELS[detectedType].color}`}>
              {TYPE_LABELS[detectedType].icon}
              Detected: {TYPE_LABELS[detectedType].label}
            </span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <GlassButton type="submit" loading={loading} disabled={!url.trim()}>
            <Link2 size={14} />
            Add to board
          </GlassButton>
        </div>
      </form>
    </Dialog>
  );
}
