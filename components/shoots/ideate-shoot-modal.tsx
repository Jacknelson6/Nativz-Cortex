'use client';

import { useState, useRef } from 'react';
import {
  Loader2,
  Sparkles,
  Video,
  Lightbulb,
  Target,
  Camera,
  Download,
  Send,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoIdea {
  title: string;
  hook: string;
  format: string;
  talkingPoints: string[];
  shotList: string[];
  whyItWorks: string;
}

interface ShootPlan {
  title: string;
  summary: string;
  videoIdeas: VideoIdea[];
  generalTips: string[];
  equipmentSuggestions: string[];
  raw?: string;
}

interface IdeatePlanResult {
  plan: ShootPlan;
  usage?: { input_tokens: number; output_tokens: number };
  estimatedCost?: number;
}

interface IdeateShootModalProps {
  open: boolean;
  onClose: () => void;
  shoot: {
    clientName: string;
    clientId: string | null;
    shootDate: string | null;
    industry: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IdeateShootModal({ open, onClose, shoot }: IdeateShootModalProps) {
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IdeatePlanResult | null>(null);
  const [expandedIdea, setExpandedIdea] = useState<number | null>(0);
  const resultRef = useRef<HTMLDivElement>(null);

  function reset() {
    setContext('');
    setLoading(false);
    setResult(null);
    setExpandedIdea(0);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleGenerate() {
    if (!context.trim() || !shoot) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/shoots/ideate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: shoot.clientName,
          clientId: shoot.clientId,
          shootDate: shoot.shootDate,
          industry: shoot.industry,
          context: context.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to generate shoot plan');
        return;
      }

      const data: IdeatePlanResult = await res.json();
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadPdf() {
    if (!result?.plan || !shoot) return;
    const plan = result.plan;

    // Build text content for download
    const lines: string[] = [
      plan.title || `${shoot.clientName} Shoot Plan`,
      '='.repeat(50),
      '',
      plan.summary || '',
      '',
    ];

    plan.videoIdeas?.forEach((idea, i) => {
      lines.push(`--- Video ${i + 1}: ${idea.title} ---`);
      lines.push(`Format: ${idea.format}`);
      lines.push(`Hook: ${idea.hook}`);
      lines.push('');
      if (idea.talkingPoints?.length) {
        lines.push('Talking points:');
        idea.talkingPoints.forEach((p) => lines.push(`  - ${p}`));
        lines.push('');
      }
      if (idea.shotList?.length) {
        lines.push('Shot list:');
        idea.shotList.forEach((s) => lines.push(`  - ${s}`));
        lines.push('');
      }
      if (idea.whyItWorks) {
        lines.push(`Why it works: ${idea.whyItWorks}`);
        lines.push('');
      }
    });

    if (plan.generalTips?.length) {
      lines.push('--- General tips ---');
      plan.generalTips.forEach((t) => lines.push(`  - ${t}`));
      lines.push('');
    }

    if (plan.equipmentSuggestions?.length) {
      lines.push('--- Equipment suggestions ---');
      plan.equipmentSuggestions.forEach((e) => lines.push(`  - ${e}`));
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${shoot.clientName.replace(/\s+/g, '-').toLowerCase()}-shoot-plan.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Shoot plan downloaded');
  }

  const plan = result?.plan;

  return (
    <Dialog open={open} onClose={handleClose} title="" maxWidth="xl">
      {/* Custom header */}
      <div className="-mt-4 -mx-6 -mb-2 px-6 pb-4 border-b border-nativz-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/15">
            <Sparkles size={18} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {plan ? plan.title : 'Ideate shoot'}
            </h2>
            <p className="text-xs text-text-muted">
              {shoot?.clientName}{shoot?.shootDate ? ` — ${new Date(shoot.shootDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Input form — show when no result yet */}
        {!plan && (
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
              disabled={loading}
            />

            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <GlassButton onClick={handleGenerate} disabled={!context.trim() || loading}>
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Generating plan...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Generate shoot plan
                  </>
                )}
              </GlassButton>
            </div>
          </div>
        )}

        {/* Results */}
        {plan && (
          <div ref={resultRef} className="space-y-5">
            {/* Summary */}
            {plan.summary && (
              <p className="text-sm text-text-secondary leading-relaxed">
                {plan.summary}
              </p>
            )}

            {/* Video Ideas */}
            {(plan.videoIdeas ?? []).length > 0 && (
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide">
                  <Video size={13} />
                  Video ideas ({plan.videoIdeas.length})
                </h3>

                {plan.videoIdeas.map((idea, i) => {
                  const isExpanded = expandedIdea === i;

                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-nativz-border bg-surface-hover/30 overflow-hidden"
                    >
                      <button
                        onClick={() => setExpandedIdea(isExpanded ? null : i)}
                        className="cursor-pointer w-full flex items-center justify-between gap-3 p-3 text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-[10px] font-bold text-purple-400">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {idea.title}
                            </p>
                            {!isExpanded && idea.format && (
                              <p className="text-[11px] text-text-muted truncate mt-0.5">{idea.format}</p>
                            )}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp size={14} className="shrink-0 text-text-muted" />
                        ) : (
                          <ChevronDown size={14} className="shrink-0 text-text-muted" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-3 border-t border-nativz-border pt-3">
                          {/* Format badge */}
                          {idea.format && (
                            <Badge variant="purple">{idea.format}</Badge>
                          )}

                          {/* Hook */}
                          {idea.hook && (
                            <div>
                              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">Hook (first 3s)</p>
                              <p className="text-sm text-text-primary italic">&ldquo;{idea.hook}&rdquo;</p>
                            </div>
                          )}

                          {/* Talking points */}
                          {idea.talkingPoints?.length > 0 && (
                            <div>
                              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                <Lightbulb size={11} /> Talking points
                              </p>
                              <ul className="space-y-1">
                                {idea.talkingPoints.map((point, pi) => (
                                  <li key={pi} className="flex items-start gap-2 text-sm text-text-secondary">
                                    <span className="text-accent-text mt-0.5">-</span>
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Shot list */}
                          {idea.shotList?.length > 0 && (
                            <div>
                              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                <Camera size={11} /> Shot list
                              </p>
                              <ul className="space-y-1">
                                {idea.shotList.map((shot, si) => (
                                  <li key={si} className="flex items-start gap-2 text-sm text-text-secondary">
                                    <span className="text-purple-400 mt-0.5">-</span>
                                    {shot}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Why it works */}
                          {idea.whyItWorks && (
                            <div className="rounded-md bg-accent/5 border border-accent/10 px-3 py-2">
                              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Target size={11} /> Why it works
                              </p>
                              <p className="text-xs text-text-secondary">{idea.whyItWorks}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* General Tips */}
            {(plan.generalTips ?? []).length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                  <Lightbulb size={13} />
                  Tips for the videographer
                </h3>
                <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3">
                  <ul className="space-y-1.5">
                    {plan.generalTips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                        <span className="text-amber-400 mt-0.5">-</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Equipment Suggestions */}
            {(plan.equipmentSuggestions ?? []).length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                  <Camera size={13} />
                  Equipment suggestions
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {plan.equipmentSuggestions.map((eq, i) => (
                    <Badge key={i} variant="info">{eq}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Cost info */}
            {result?.estimatedCost != null && (
              <p className="text-[10px] text-text-muted text-right">
                AI cost: ~${result.estimatedCost.toFixed(4)}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-nativz-border">
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setResult(null); setExpandedIdea(0); }}
                >
                  <X size={14} />
                  Regenerate
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                  <Download size={14} />
                  Download
                </Button>
                <GlassButton
                  onClick={() => toast.info('Send to client coming soon')}
                  className="!px-4 !py-2 !text-sm"
                >
                  <Send size={14} />
                  Send to client
                </GlassButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
