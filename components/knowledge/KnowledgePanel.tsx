'use client';

import { X, ExternalLink } from 'lucide-react';

interface KnowledgePanelProps {
  node: {
    id: string;
    data: {
      type: string;
      title: string;
      subtitle?: string;
      content?: string;
      metadata?: Record<string, unknown>;
      source?: string;
      created_at?: string;
      nodeKind?: 'entry' | 'external';
    };
  };
  clientId: string;
  onClose: () => void;
}

const TYPE_BADGE_COLORS: Record<string, string> = {
  brand_profile: 'bg-blue-500/20 text-blue-400',
  brand_asset: 'bg-blue-500/20 text-blue-400',
  web_page: 'bg-green-500/20 text-green-400',
  note: 'bg-yellow-500/20 text-yellow-400',
  document: 'bg-purple-500/20 text-purple-400',
  contact: 'bg-orange-500/20 text-orange-400',
  search: 'bg-teal-500/20 text-teal-400',
  strategy: 'bg-red-500/20 text-red-400',
  idea: 'bg-pink-500/20 text-pink-400',
  idea_submission: 'bg-pink-500/20 text-pink-400',
};

export function KnowledgePanel({ node, clientId, onClose }: KnowledgePanelProps) {
  const { data } = node;
  const badgeColor = TYPE_BADGE_COLORS[data.type] ?? 'bg-slate-500/20 text-slate-400';

  return (
    <div className="fixed right-0 top-0 z-50 h-full w-[400px] border-l border-nativz-border bg-surface shadow-elevated overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-nativz-border">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-primary break-words">{data.title}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeColor}`}>
              {data.type.replace(/_/g, ' ')}
            </span>
            {data.source && (
              <span className="inline-flex rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-text-muted">
                {data.source}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {data.content && (
          <div>
            <h3 className="text-xs font-medium text-text-secondary mb-1.5">Content</h3>
            <pre className="text-xs text-text-primary whitespace-pre-wrap break-words bg-background rounded-lg p-3 max-h-[400px] overflow-y-auto">
              {data.content}
            </pre>
          </div>
        )}

        {data.subtitle && !data.content && (
          <div>
            <h3 className="text-xs font-medium text-text-secondary mb-1.5">Details</h3>
            <p className="text-xs text-text-primary">{data.subtitle}</p>
          </div>
        )}

        {/* Metadata */}
        {data.metadata && Object.keys(data.metadata).length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-text-secondary mb-1.5">Metadata</h3>
            <div className="space-y-1.5">
              {Object.entries(data.metadata).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider shrink-0 mt-0.5">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-text-primary break-all">
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Created at */}
        {data.created_at && (
          <div>
            <h3 className="text-xs font-medium text-text-secondary mb-1">Created</h3>
            <p className="text-xs text-text-muted">
              {new Date(data.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        )}

        {/* Edit button for entries */}
        {data.nodeKind === 'entry' && (
          <a
            href={`/admin/clients/${clientId}/knowledge`}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-surface px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-surface/80 transition-colors"
          >
            <ExternalLink size={12} />
            Edit entry
          </a>
        )}
      </div>
    </div>
  );
}
