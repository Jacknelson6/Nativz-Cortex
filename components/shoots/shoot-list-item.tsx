'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { GlassButton } from '@/components/ui/glass-button';
import { AgencyBadge } from '@/components/clients/agency-badge';
import type { ShootItem } from './types';
import { ShootAvatar } from './shoot-avatar';
import { ShootPlanPreview } from './shoot-plan-preview';

export function ShootListItem({
  item,
  index,
  onSelect,
  onIdeate,
}: {
  item: ShootItem;
  index: number;
  onSelect: () => void;
  onIdeate: () => void;
}) {
  const [planExpanded, setPlanExpanded] = useState(false);
  const date = item.date ? new Date(item.date + 'T00:00:00') : null;
  const plan = item.planData;

  return (
    <div
      className="animate-stagger-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <Card className="space-y-0">
        <div className="flex items-center gap-3">
          {/* Date badge */}
          {date && (
            <button
              onClick={onSelect}
              className="cursor-pointer flex flex-col items-center justify-center rounded-lg bg-accent/10 text-accent px-2.5 py-1.5 min-w-[48px] hover:bg-accent/20 transition-colors"
            >
              <span className="text-base font-bold leading-none">{date.getDate()}</span>
              <span className="text-[10px] font-medium uppercase mt-0.5">
                {date.toLocaleDateString('en-US', { month: 'short' })}
              </span>
            </button>
          )}

          {/* Avatar */}
          <button onClick={onSelect} className="cursor-pointer hover:opacity-80 transition-opacity">
            <ShootAvatar item={item} />
          </button>

          {/* Content */}
          <button onClick={onSelect} className="cursor-pointer flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-text-primary truncate">{item.clientName}</p>
              {item.abbreviation && (
                <span className="shrink-0 text-[10px] font-medium text-text-muted">{item.abbreviation}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <AgencyBadge agency={item.agency || undefined} />
            </div>
          </button>

          {/* Ideate / View plan */}
          {plan ? (
            <GlassButton
              onClick={() => setPlanExpanded(!planExpanded)}
            >
              <Sparkles size={14} />
              {plan.videoIdeas?.length ?? 0} ideas
              {planExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </GlassButton>
          ) : (
            <GlassButton
              onClick={onIdeate}
            >
              <Sparkles size={14} />
              Ideate
            </GlassButton>
          )}
        </div>

        {/* Expanded plan preview */}
        {plan && planExpanded && (
          <ShootPlanPreview plan={plan} clientName={item.clientName} />
        )}
      </Card>
    </div>
  );
}
