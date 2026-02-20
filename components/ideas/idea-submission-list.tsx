'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb, Plus, Clock, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { IdeaSubmitDialog } from '@/components/ideas/idea-submit-dialog';
import { formatRelativeTime } from '@/lib/utils/format';
import type { IdeaSubmission } from '@/lib/types/database';

interface IdeaSubmissionListProps {
  clientId: string;
  submissions: IdeaSubmission[];
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'info' | 'success' | 'warning' }> = {
  new: { label: 'Submitted', variant: 'default' },
  reviewed: { label: 'Reviewed', variant: 'info' },
  accepted: { label: 'Accepted', variant: 'success' },
  archived: { label: 'Archived', variant: 'default' },
};

const CATEGORY_LABEL: Record<string, string> = {
  trending: 'Trending',
  content_idea: 'Content idea',
  request: 'Request',
  other: 'Other',
};

export function IdeaSubmissionList({ clientId, submissions }: IdeaSubmissionListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2.5">
            <Lightbulb size={20} className="text-yellow-400" />
            Ideas
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Share trending things you&apos;ve seen, content ideas, or requests for your team.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus size={16} />
          New idea
        </Button>
      </div>

      {submissions.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={24} />}
          title="No ideas yet"
          description="Spot something trending? Have a content idea? Submit it here and your team will see it."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus size={16} />
              Submit your first idea
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {submissions.map((idea) => {
            const statusInfo = STATUS_BADGE[idea.status] || STATUS_BADGE.new;
            return (
              <Card key={idea.id} padding="none">
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{idea.title}</p>
                      {idea.description && (
                        <p className="mt-1 text-sm text-text-muted line-clamp-2">{idea.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        <span className="text-xs text-text-muted">{CATEGORY_LABEL[idea.category] || idea.category}</span>
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Clock size={10} />
                          {formatRelativeTime(idea.created_at)}
                        </span>
                        {idea.source_url && (
                          <a
                            href={idea.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent-text hover:underline flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={10} />
                            Source
                          </a>
                        )}
                      </div>
                      {idea.admin_notes && (
                        <div className="mt-2 rounded-lg bg-surface-hover px-3 py-2">
                          <p className="text-xs font-medium text-text-secondary">Team note</p>
                          <p className="text-xs text-text-muted">{idea.admin_notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <IdeaSubmitDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        clientId={clientId}
        onSubmitted={() => router.refresh()}
      />
    </>
  );
}
