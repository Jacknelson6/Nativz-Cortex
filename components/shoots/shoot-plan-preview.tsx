'use client';

import { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  Video,
  Lightbulb,
  Target,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { ShootPlanData } from './types';

export function ShootPlanPreview({ plan, clientName }: { plan: ShootPlanData; clientName: string }) {
  const [expandedIdea, setExpandedIdea] = useState<number | null>(0);

  function handleDownload() {
    const lines: string[] = [
      plan.title || `${clientName} Shoot Plan`,
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
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clientName.replace(/\s+/g, '-').toLowerCase()}-shoot-plan.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Shoot plan downloaded');
  }

  return (
    <div className="mt-3 pt-3 border-t border-nativz-border space-y-3 animate-expand-in">
      {/* Plan header */}
      <div className="flex items-center justify-between">
        <div>
          {plan.title && (
            <h4 className="text-sm font-semibold text-text-primary">{plan.title}</h4>
          )}
          {plan.summary && (
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{plan.summary}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleDownload}>
          <Download size={12} />
          Download
        </Button>
      </div>

      {/* Video Ideas */}
      {(plan.videoIdeas ?? []).length > 0 && (
        <div className="space-y-1.5">
          <h5 className="flex items-center gap-1.5 text-[10px] font-medium text-text-muted uppercase tracking-wide">
            <Video size={11} />
            Video ideas ({plan.videoIdeas.length})
          </h5>

          {plan.videoIdeas.map((idea, i) => {
            const isExpanded = expandedIdea === i;

            return (
              <div
                key={i}
                className="rounded-lg border border-nativz-border bg-surface-hover/30 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedIdea(isExpanded ? null : i)}
                  className="cursor-pointer w-full flex items-center justify-between gap-3 p-2.5 text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent2-surface text-[10px] font-bold text-accent2-text">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{idea.title}</p>
                      {!isExpanded && idea.format && (
                        <p className="text-[10px] text-text-muted truncate">{idea.format}</p>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={12} className="shrink-0 text-text-muted" />
                  ) : (
                    <ChevronDown size={12} className="shrink-0 text-text-muted" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-2.5 pb-2.5 space-y-2.5 border-t border-nativz-border pt-2.5">
                    {idea.format && <Badge variant="purple">{idea.format}</Badge>}

                    {idea.hook && (
                      <div>
                        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-0.5">Hook</p>
                        <p className="text-xs text-text-primary italic">&ldquo;{idea.hook}&rdquo;</p>
                      </div>
                    )}

                    {idea.talkingPoints?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1">
                          <Lightbulb size={9} /> Talking points
                        </p>
                        <ul className="space-y-0.5">
                          {idea.talkingPoints.map((point, pi) => (
                            <li key={pi} className="flex items-start gap-1.5 text-xs text-text-secondary">
                              <span className="text-accent-text mt-0.5">-</span>
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {idea.shotList?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1">
                          <Camera size={9} /> Shot list
                        </p>
                        <ul className="space-y-0.5">
                          {idea.shotList.map((shot, si) => (
                            <li key={si} className="flex items-start gap-1.5 text-xs text-text-secondary">
                              <span className="text-accent2-text mt-0.5">-</span>
                              {shot}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {idea.whyItWorks && (
                      <div className="rounded-md bg-accent/5 border border-accent/10 px-2.5 py-1.5">
                        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-0.5 flex items-center gap-1">
                          <Target size={9} /> Why it works
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

      {/* Tips & Equipment */}
      {(plan.generalTips ?? []).length > 0 && (
        <div>
          <h5 className="flex items-center gap-1.5 text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
            <Lightbulb size={11} /> Tips
          </h5>
          <ul className="space-y-0.5">
            {plan.generalTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                <span className="text-amber-400 mt-0.5">-</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(plan.equipmentSuggestions ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {plan.equipmentSuggestions.map((eq, i) => (
            <Badge key={i} variant="info">{eq}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
