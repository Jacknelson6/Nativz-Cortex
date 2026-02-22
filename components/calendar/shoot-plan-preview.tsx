'use client';

import { useState, useEffect } from 'react';
import { Loader2, Calendar, Camera, ListChecks, BarChart3, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ShootPlan } from '@/lib/types/strategy';

interface ShootPlanPreviewProps {
  shootId: string;
}

export function ShootPlanPreview({ shootId }: ShootPlanPreviewProps) {
  const [plan, setPlan] = useState<ShootPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlan() {
      try {
        const res = await fetch(`/api/shoots/${shootId}/plan`);
        if (res.ok) {
          const data = await res.json();
          setPlan(data.plan_data as ShootPlan);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchPlan();
  }, [shootId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">No plan data available for this shoot.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-slide-in">
      {/* Overview */}
      <Card>
        <h3 className="text-base font-semibold text-text-primary mb-2">Overview</h3>
        <p className="text-sm text-text-secondary leading-relaxed">{plan.overview}</p>
      </Card>

      {/* Client context */}
      <Card padding="sm">
        <p className="text-sm text-text-secondary">{plan.client_context}</p>
      </Card>

      {/* Past performance */}
      {plan.past_performance_insights && (
        <Card padding="sm">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={14} className="text-accent" />
            <h4 className="text-sm font-semibold text-text-primary">Past performance insights</h4>
          </div>
          <p className="text-sm text-text-secondary">{plan.past_performance_insights}</p>
        </Card>
      )}

      {/* Trending angles */}
      {(plan.trending_angles ?? []).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-amber-400" />
            <h3 className="text-base font-semibold text-text-primary">Trending angles</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(plan.trending_angles ?? []).map((angle, i) => (
              <Card key={i} padding="sm">
                <h4 className="text-sm font-semibold text-text-primary mb-1">{angle.topic}</h4>
                <p className="text-xs text-accent mb-1">{angle.angle}</p>
                <p className="text-[10px] text-text-muted">{angle.why_now}</p>
                <div className="flex gap-2 mt-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface-hover text-text-muted">
                    {angle.format}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md ${
                    angle.estimated_virality === 'viral_potential' ? 'bg-red-500/15 text-red-400'
                    : angle.estimated_virality === 'high' ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-surface-hover text-text-muted'
                  }`}>
                    {angle.estimated_virality}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Shot list */}
      {(plan.shot_list ?? []).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Camera size={14} className="text-accent" />
            <h3 className="text-base font-semibold text-text-primary">Shot list</h3>
          </div>
          <div className="space-y-2">
            {(plan.shot_list ?? []).map((shot, i) => {
              const priorityColors = {
                must_have: 'bg-red-500/15 text-red-400 border-red-500/20',
                nice_to_have: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
                bonus: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
              };
              const colors = priorityColors[shot.priority] ?? priorityColors.nice_to_have;

              return (
                <Card key={i} padding="sm">
                  <div className="flex items-start gap-3">
                    <span className="text-lg font-bold text-text-muted/30 tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-text-primary">{shot.title}</h4>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium border ${colors}`}>
                          {shot.priority.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary mb-1">{shot.description}</p>
                      <p className="text-[10px] text-accent mb-1">Hook: &ldquo;{shot.hook}&rdquo;</p>
                      <p className="text-[10px] text-text-muted">
                        {shot.format} • {shot.platform} • B-roll: {shot.b_roll_notes}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Content calendar */}
      {(plan.content_calendar ?? []).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} className="text-[#8B5CF6]" />
            <h3 className="text-base font-semibold text-text-primary">Content calendar</h3>
          </div>
          <Card padding="sm">
            <div className="space-y-2">
              {(plan.content_calendar ?? []).map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-nativz-border last:border-0">
                  <span className="text-xs font-medium text-accent min-w-[80px]">{item.day}</span>
                  <div className="flex-1">
                    <p className="text-sm text-text-primary">{item.content_title}</p>
                    <p className="text-[10px] text-text-muted">{item.platform} • {item.format}</p>
                  </div>
                  {item.notes && (
                    <p className="text-[10px] text-text-muted max-w-[150px] truncate">{item.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Logistics */}
      {(plan.logistics_notes ?? []).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ListChecks size={14} className="text-emerald-400" />
            <h3 className="text-base font-semibold text-text-primary">Logistics checklist</h3>
          </div>
          <Card padding="sm">
            <div className="space-y-1.5">
              {(plan.logistics_notes ?? []).map((note, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-4 h-4 mt-0.5 rounded border border-nativz-border flex-shrink-0" />
                  <p className="text-sm text-text-secondary">{note}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
