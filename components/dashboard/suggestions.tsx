import Link from 'next/link';
import {
  ArrowRight,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import type { ReactNode } from 'react';

export type SuggestionPriority = 'urgent' | 'high' | 'normal';

export interface Suggestion {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  priority: SuggestionPriority;
  category: 'shoot' | 'research' | 'ideas' | 'strategy';
}

interface SuggestionsProps {
  suggestions: Suggestion[];
}

const priorityConfig: Record<SuggestionPriority, { badge: string; variant: 'danger' | 'warning' | 'info'; border: string }> = {
  urgent: { badge: 'Urgent', variant: 'danger', border: 'border-l-red-500/60' },
  high: { badge: 'High', variant: 'warning', border: 'border-l-amber-500/60' },
  normal: { badge: '', variant: 'info', border: 'border-l-accent/40' },
};

export function Suggestions({ suggestions }: SuggestionsProps) {
  if (suggestions.length === 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <div className="rounded-lg bg-accent-surface p-2 text-accent-text">
            <Zap size={16} />
          </div>
          <h2 className="text-base font-semibold text-text-primary">Suggested next actions</h2>
        </div>
        <EmptyState
          icon={<Zap size={24} />}
          title="All caught up"
          description="No urgent actions right now. Everything is on track."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent-surface p-2 text-accent-text">
            <Zap size={16} />
          </div>
          <h2 className="text-base font-semibold text-text-primary">Suggested next actions</h2>
        </div>
        <Badge variant="info">{suggestions.length} action{suggestions.length !== 1 ? 's' : ''}</Badge>
      </div>
      <div className="space-y-2">
        {suggestions.map((suggestion, i) => {
          const config = priorityConfig[suggestion.priority];

          return (
            <Link key={suggestion.id} href={suggestion.href}>
              <div
                className={`animate-stagger-in flex items-center gap-3 rounded-lg border border-nativz-border-light border-l-[3px] ${config.border} px-4 py-3 hover:bg-surface-hover transition-colors group`}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-muted group-hover:text-accent-text transition-colors">
                  {suggestion.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{suggestion.title}</p>
                  <p className="text-xs text-text-muted mt-0.5 truncate">{suggestion.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {suggestion.priority !== 'normal' && (
                    <Badge variant={config.variant}>{config.badge}</Badge>
                  )}
                  <ArrowRight size={14} className="text-text-muted group-hover:text-accent-text transition-colors" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
