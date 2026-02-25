'use client';

import { useState } from 'react';
import { Share2, Check, Loader2, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ShareButtonProps {
  searchId: string;
}

export function ShareButton({ searchId }: ShareButtonProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    setLoading(true);
    try {
      const res = await fetch(`/api/search/${searchId}/share`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create share link');
        return;
      }

      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      toast.success('Share link copied to clipboard');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Failed to create share link');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleShare} disabled={loading}>
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : copied ? (
        <Check size={14} className="text-emerald-400" />
      ) : (
        <Share2 size={14} />
      )}
      {copied ? 'Copied!' : 'Share'}
    </Button>
  );
}
