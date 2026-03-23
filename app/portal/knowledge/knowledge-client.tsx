'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain,
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  StickyNote,
  Lightbulb,
  Users,
  Palette,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { formatRelativeTime } from '@/lib/utils/format';

interface KnowledgeEntry {
  id: string;
  type: string;
  title: string;
  content: string;
  source: string;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'purple' | 'emerald'; icon: React.ReactNode }> = {
  brand_asset: { label: 'Brand asset', variant: 'purple', icon: <Palette size={12} /> },
  brand_profile: { label: 'Brand profile', variant: 'purple', icon: <Palette size={12} /> },
  document: { label: 'Document', variant: 'info', icon: <FileText size={12} /> },
  web_page: { label: 'Web page', variant: 'default', icon: <Globe size={12} /> },
  note: { label: 'Note', variant: 'warning', icon: <StickyNote size={12} /> },
  idea: { label: 'Idea', variant: 'emerald', icon: <Lightbulb size={12} /> },
  meeting_note: { label: 'Meeting note', variant: 'info', icon: <Users size={12} /> },
};

interface KnowledgeClientProps {
  clientId: string;
  entries: KnowledgeEntry[];
}

export function KnowledgeClient({ clientId, entries: initialEntries }: KnowledgeClientProps) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addContent, setAddContent] = useState('');
  const [addType, setAddType] = useState('note');
  const [submitting, setSubmitting] = useState(false);

  const filteredEntries = searchQuery
    ? entries.filter((e) =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

  async function handleAdd() {
    if (!addTitle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: addType,
          title: addTitle.trim(),
          content: addContent.trim(),
          source: 'manual',
        }),
      });
      if (res.ok) {
        setAddTitle('');
        setAddContent('');
        setAddType('note');
        setShowAddForm(false);
        router.refresh();
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="ui-page-title flex items-center gap-2.5">
            <Brain size={20} className="text-accent-text" />
            Knowledge
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Brand assets, documents, and notes for your brand.
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} variant={showAddForm ? 'outline' : 'primary'}>
          {showAddForm ? <X size={16} /> : <Plus size={16} />}
          {showAddForm ? 'Cancel' : 'Add entry'}
        </Button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <Card className="mb-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1.5">Type</label>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value)}
                className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="note">Note</option>
                <option value="idea">Idea</option>
                <option value="document">Document</option>
                <option value="web_page">Web page</option>
                <option value="brand_asset">Brand asset</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1.5">Title</label>
              <Input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Entry title..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1.5">Content</label>
              <textarea
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
                placeholder="Enter content..."
                rows={4}
                className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleAdd} disabled={!addTitle.trim() || submitting}>
                {submitting ? 'Adding...' : 'Add entry'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search entries..."
          className="pl-9"
        />
      </div>

      {/* Entries */}
      {filteredEntries.length === 0 ? (
        <EmptyState
          icon={<Brain size={24} />}
          title={searchQuery ? 'No matching entries' : 'No knowledge entries yet'}
          description={searchQuery ? 'Try a different search term.' : 'Add notes, documents, and brand assets to build your knowledge base.'}
        />
      ) : (
        <div className="space-y-2">
          {filteredEntries.map((entry) => {
            const typeInfo = TYPE_CONFIG[entry.type] ?? { label: entry.type, variant: 'default' as const, icon: <FileText size={12} /> };
            const isExpanded = expandedId === entry.id;
            const excerpt = entry.content.length > 120
              ? entry.content.slice(0, 120) + '...'
              : entry.content;

            return (
              <Card key={entry.id} padding="none">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full text-left px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{entry.title}</p>
                      {!isExpanded && excerpt && (
                        <p className="mt-1 text-xs text-text-muted line-clamp-1">{excerpt}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant={typeInfo.variant}>
                          <span className="flex items-center gap-1">
                            {typeInfo.icon}
                            {typeInfo.label}
                          </span>
                        </Badge>
                        <span className="text-xs text-text-muted">
                          {formatRelativeTime(entry.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-text-muted mt-1">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {isExpanded && entry.content && (
                    <div className="mt-3 rounded-lg bg-surface-hover p-4">
                      <p className="text-sm text-text-secondary whitespace-pre-wrap">
                        {entry.content}
                      </p>
                    </div>
                  )}
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
