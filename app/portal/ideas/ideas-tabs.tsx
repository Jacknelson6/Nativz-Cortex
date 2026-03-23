'use client';

import { useState } from 'react';
import { Lightbulb, Bookmark, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { IdeaSubmissionList } from '@/components/ideas/idea-submission-list';
import { formatRelativeTime } from '@/lib/utils/format';
import type { IdeaSubmission } from '@/lib/types/database';

interface SavedIdea {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface PortalIdeasTabsProps {
  clientId: string;
  submissions: IdeaSubmission[];
  savedIdeas: SavedIdea[];
}

export function PortalIdeasTabs({ clientId, submissions, savedIdeas }: PortalIdeasTabsProps) {
  const [tab, setTab] = useState<'submitted' | 'saved'>('submitted');

  return (
    <>
      {/* Tab switcher */}
      <div className="flex items-center gap-1 rounded-lg bg-surface-hover p-1 mb-6">
        <button
          type="button"
          onClick={() => setTab('submitted')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'submitted'
              ? 'bg-surface text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Lightbulb size={14} />
            Your ideas
            {submissions.length > 0 && (
              <span className="rounded-full bg-accent-surface px-1.5 py-0.5 text-[10px] font-bold text-accent-text">
                {submissions.length}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('saved')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'saved'
              ? 'bg-surface text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Bookmark size={14} />
            Saved from research
            {savedIdeas.length > 0 && (
              <span className="rounded-full bg-accent-surface px-1.5 py-0.5 text-[10px] font-bold text-accent-text">
                {savedIdeas.length}
              </span>
            )}
          </span>
        </button>
      </div>

      {/* Submitted tab */}
      {tab === 'submitted' && (
        <IdeaSubmissionList clientId={clientId} submissions={submissions} />
      )}

      {/* Saved tab */}
      {tab === 'saved' && (
        <>
          {savedIdeas.length === 0 ? (
            <EmptyState
              icon={<Bookmark size={24} />}
              title="No saved ideas yet"
              description="Ideas saved from research will appear here."
            />
          ) : (
            <div className="space-y-3">
              {savedIdeas.map((idea) => (
                <Card key={idea.id} padding="none">
                  <div className="px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{idea.title}</p>
                      {idea.content && (
                        <p className="mt-1 text-sm text-text-muted line-clamp-3">{idea.content}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="emerald">
                          <span className="flex items-center gap-1">
                            <Lightbulb size={10} />
                            Saved idea
                          </span>
                        </Badge>
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Clock size={10} />
                          {formatRelativeTime(idea.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
