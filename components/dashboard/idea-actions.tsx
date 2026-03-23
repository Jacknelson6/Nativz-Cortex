'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IdeaActionsProps {
  ideaId: string;
}

export function IdeaActions({ ideaId }: IdeaActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [archiving, setArchiving] = useState(false);

  async function handleArchive() {
    setArchiving(true);
    try {
      const res = await fetch(`/api/ideas/${ideaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });

      if (!res.ok) {
        console.error('Failed to update idea:', await res.text());
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error('Error updating idea:', error);
    } finally {
      setArchiving(false);
    }
  }

  const isLoading = isPending || archiving;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 !p-0 text-text-muted hover:bg-red-500/15 hover:text-red-400"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleArchive();
        }}
        disabled={isLoading}
        title="Archive idea"
      >
        {archiving ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
      </Button>
    </div>
  );
}
