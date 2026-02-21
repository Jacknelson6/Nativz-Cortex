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
  { value: 'accepted', label: 'Accepted' },
  { value: 'archived', label: 'Archived' },
];

export function IdeaTriageList({ submissions: initial, clientName }: IdeaTriageListProps) {
  const [submissions, setSubmissions] = useState(initial);
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? submissions : submissions.filter((s) => s.status === filter);
  const counts = {
    all: submissions.length,
    new: submissions.filter((s) => s.status === 'new').length,
    accepted: submissions.filter((s) => s.status === 'accepted').length,
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
        <h1 className="text-2xl font-semibold text-text-primary">
          Ideas from {clientName}
        </h1>
        <p className="mt-1 text-sm text-text-muted">Review and triage ideas submitted by the client.</p>
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
            {counts[opt.value as keyof typeof counts] > 0 && (
              <span className="ml-1.5 opacity-70">{counts[opt.value as keyof typeof counts]}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={24} />}
          title={filter === 'all' ? 'No ideas submitted yet' : `No ${filter} ideas`}
          description={filter === 'all' ? `${clientName} hasn't submitted any ideas yet.` : 'Try a different filter.'}
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
