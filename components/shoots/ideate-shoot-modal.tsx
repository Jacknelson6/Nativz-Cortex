'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IdeateShootModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated?: () => void;
  shoot: {
    clientName: string;
    clientId: string | null;
    shootDate: string | null;
    industry: string | null;
    mondayItemId?: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IdeateShootModal({ open, onClose, onGenerated, shoot }: IdeateShootModalProps) {
  const [context, setContext] = useState('');

  function reset() {
    setContext('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleGenerate() {
    if (!context.trim() || !shoot) return;

    const toastId = toast.loading(`Generating shoot plan for ${shoot.clientName}...`);

    // Close modal immediately
    const savedContext = context.trim();
    reset();
    onClose();

    // Fire API call in background
    try {
      const res = await fetch('/api/shoots/ideate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: shoot.clientName,
          clientId: shoot.clientId,
          shootDate: shoot.shootDate,
          industry: shoot.industry,
          context: savedContext,
          mondayItemId: shoot.mondayItemId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to generate shoot plan', { id: toastId });
        return;
      }

      const data = await res.json();
      const ideaCount = data.plan?.videoIdeas?.length ?? 0;

      toast.success(
        `Shoot plan ready — ${ideaCount} video idea${ideaCount !== 1 ? 's' : ''} for ${shoot.clientName}`,
        {
          id: toastId,
          duration: 5000,
          action: {
            label: 'View',
            onClick: () => {
              // Trigger refresh of shoots page to show the new plan
              onGenerated?.();
            },
          },
        },
      );

      // Also trigger refresh immediately
      onGenerated?.();
    } catch {
      toast.error('Something went wrong generating the plan.', { id: toastId });
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="" maxWidth="lg">
      {/* Custom header */}
      <div className="-mt-2 mb-4 pb-4 border-b border-nativz-border pr-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/15">
            <Sparkles size={18} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Ideate shoot
            </h2>
            <p className="text-xs text-text-muted">
              {shoot?.clientName}{shoot?.shootDate ? ` — ${new Date(shoot.shootDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Describe the shoot — location, client goals, any specific products or services to highlight, content style preferences, or anything the videographer should know.
        </p>

        <Textarea
          id="ideate-context"
          label="Shoot details"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. Outdoor shoot at their new office location. They want to showcase the team culture, behind-the-scenes of their product line, and get some testimonial-style content from the founder..."
          rows={5}
        />

        <div className="flex items-center justify-between pt-1">
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <GlassButton onClick={handleGenerate} disabled={!context.trim()}>
            <Sparkles size={14} />
            Generate shoot plan
          </GlassButton>
        </div>
      </div>
    </Dialog>
  );
}
