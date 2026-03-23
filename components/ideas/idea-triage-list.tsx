'use client';

import { useState } from 'react';
import { Lightbulb, Filter } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { IdeaTriageCard } from '@/components/ideas/idea-triage-card';
import type { IdeaSubmission } from '@/lib/types/database';

interface IdeaTriageListProps {
  submissions: IdeaSubmission[];
  clientName: string;
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'archived', label: 'Archived' },
] as const;

export function IdeaTriageList({ submissions: initial, clientName }: IdeaTriageListProps) {
  const [submissions, setSubmissions] = useState(initial);
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? submissions : submissions.filter((s) => s.status === filter);
  const counts = {
    all: submissions.length,
    new: submissions.filter((s) => s.status === 'new').length,
    archived: submissions.filter((s) => s.status === 'archived').length,
  };

  function handleUpdate(updated: IdeaSubmission) {
    setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleDelete(id: string) {
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="ui-page-title">Saved ideas</h1>
        <p className="mt-1 text-sm text-text-muted">
          Ideas saved for {clientName} — from the team, the idea generator, or the client portal.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto">
        <Filter size={14} className="text-text-muted shrink-0 mr-1" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === opt.value
                ? 'bg-accent-surface text-accent-text'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
            }`}
          >
            {opt.label}
            {counts[opt.value] > 0 && (
              <span className="ml-1.5 opacity-70">{counts[opt.value]}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={24} />}
          title={filter === 'all' ? 'No saved ideas yet' : `No ${filter} ideas`}
          description={
            filter === 'all'
              ? `Nothing saved for ${clientName} yet. Ideas from the portal or your team will show up here.`
              : 'Try a different filter.'
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((idea) => (
            <IdeaTriageCard key={idea.id} idea={idea} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
