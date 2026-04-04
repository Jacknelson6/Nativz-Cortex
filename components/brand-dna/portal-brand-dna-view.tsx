'use client';

import { useState } from 'react';
import { MessageSquare, Flag, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { BrandDNACards } from './brand-dna-cards';

interface PortalBrandDNAViewProps {
  clientName: string;
  guideline: {
    id: string;
    content: string;
    metadata: unknown;
    created_at: string;
    updated_at: string;
  } | null;
}

export function PortalBrandDNAView({ clientName, guideline }: PortalBrandDNAViewProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSection, setFeedbackSection] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [flagIncorrect, setFlagIncorrect] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const metadata = (guideline?.metadata as Record<string, unknown>) ?? null;

  async function handleSubmitFeedback() {
    if (!feedbackText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/brand-dna/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: feedbackSection,
          feedback: feedbackText.trim(),
          flagged_incorrect: flagIncorrect,
        }),
      });
      if (!res.ok) throw new Error('Failed to submit feedback');
      toast.success('Feedback submitted');
      setFeedbackOpen(false);
      setFeedbackText('');
      setFlagIncorrect(false);
    } catch {
      toast.error('Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  }

  if (!guideline || !metadata) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-surface mb-4">
          <Sparkles size={28} className="text-accent-text" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">Brand DNA coming soon</h2>
        <p className="text-sm text-text-muted max-w-md">
          Your team is building your brand guideline. You&apos;ll be able to review it here once it&apos;s ready.
        </p>
      </div>
    );
  }

  return (
    <div className="cortex-page-gutter max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ui-page-title-md">Your Brand DNA</h1>
          <p className="text-sm text-text-muted">{clientName}</p>
        </div>
      </div>

      <BrandDNACards metadata={metadata} clientId="" />

      {/* Full guideline read-only */}
      <div className="rounded-xl border border-nativz-border bg-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Brand guideline</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFeedbackSection('General');
              setFeedbackOpen(true);
            }}
          >
            <MessageSquare size={14} />
            Leave feedback
          </Button>
        </div>
        <div className="prose prose-invert prose-sm max-w-none text-text-secondary">
          <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans">
            {guideline.content}
          </pre>
        </div>
      </div>

      {/* Feedback dialog */}
      <Dialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} title="Leave feedback" maxWidth="sm">
        <p className="text-sm text-text-muted mb-4">
          Section: <span className="text-text-secondary font-medium">{feedbackSection}</span>
        </p>
        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder="What should we change?"
          rows={4}
          className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-colors resize-none"
        />
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={flagIncorrect}
            onChange={(e) => setFlagIncorrect(e.target.checked)}
            className="rounded border-nativz-border"
          />
          <span className="text-xs text-text-muted flex items-center gap-1">
            <Flag size={10} className="text-amber-400" />
            Flag this section as incorrect
          </span>
        </label>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => setFeedbackOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmitFeedback} disabled={submitting || !feedbackText.trim()}>
            {submitting ? 'Submitting...' : 'Submit feedback'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
