'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IdeaActionsProps {
  ideaId: string;
}

export function IdeaActions({ ideaId }: IdeaActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionType, setActionType] = useState<'review' | 'dismiss' | null>(null);

  async function handleAction(status: 'reviewed' | 'archived') {
    const type = status === 'reviewed' ? 'review' : 'dismiss';
    setActionType(type);

    try {
      const res = await fetch(`/api/ideas/${ideaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
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
      setActionType(null);
    }
  }

  const isLoading = isPending || actionType !== null;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 !p-0 text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleAction('reviewed');
        }}
        disabled={isLoading}
        title="Mark as reviewed"
      >
        {actionType === 'review' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 !p-0 text-text-muted hover:bg-red-500/15 hover:text-red-400"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleAction('archived');
        }}
        disabled={isLoading}
        title="Dismiss idea"
      >
        {actionType === 'dismiss' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
      </Button>
    </div>
  );
}
