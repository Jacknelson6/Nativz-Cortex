'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Archive, MessageSquare, ChevronDown, ExternalLink, Clock, Save, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/utils/format';
import type { IdeaSubmission } from '@/lib/types/database';

interface IdeaTriageCardProps {
  idea: IdeaSubmission;
  onUpdate: (updated: IdeaSubmission) => void;
  onDelete: (id: string) => void;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'info' | 'success' | 'warning' }> = {
  new: { label: 'New', variant: 'warning' },
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

export function IdeaTriageCard({ idea, onUpdate, onDelete }: IdeaTriageCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(idea.admin_notes || '');
  const [saving, setSaving] = useState(false);

  async function handleStatusChange(status: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/ideas/${idea.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error('Failed to update status.');
        return;
      }
      const updated = await res.json();
      onUpdate(updated);
      toast.success(`Idea ${status === 'accepted' ? 'accepted' : status === 'archived' ? 'archived' : 'updated'}.`);
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    setSaving(true);
    try {
      const res = await fetch(`/api/ideas/${idea.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: notes.trim() || null }),
      });
      if (!res.ok) {
        toast.error('Failed to save notes.');
        return;
      }
      const updated = await res.json();
      onUpdate(updated);
      toast.success('Notes saved.');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  const statusInfo = STATUS_BADGE[idea.status] || STATUS_BADGE.new;

  return (
    <Card padding="none">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 hover:bg-surface-hover/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">{idea.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              <span className="text-xs text-text-muted">{CATEGORY_LABEL[idea.category] || idea.category}</span>
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Clock size={10} />
                {formatRelativeTime(idea.created_at)}
              </span>
            </div>
          </div>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 mt-0.5"
          >
            <ChevronDown size={16} className="text-text-muted" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 pt-0 border-t border-nativz-border-light space-y-4">
              {/* Description */}
              {idea.description && (
                <div className="pt-3">
                  <p className="text-xs font-medium text-text-secondary mb-1">Description</p>
                  <p className="text-sm text-text-muted whitespace-pre-wrap">{idea.description}</p>
                </div>
              )}

              {/* Source link */}
              {idea.source_url && (
                <div>
                  <a
                    href={idea.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent-text hover:underline flex items-center gap-1.5"
                  >
                    <ExternalLink size={12} />
                    {idea.source_url}
                  </a>
                </div>
              )}

              {/* Admin notes */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MessageSquare size={12} className="text-text-muted" />
                  <p className="text-xs font-medium text-text-secondary">Internal notes</p>
                </div>
                <Textarea
                  id={`notes-${idea.id}`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add a note for your team..."
                  rows={2}
                />
                {notes !== (idea.admin_notes || '') && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={handleSaveNotes}
                    disabled={saving}
                  >
                    <Save size={12} />
                    Save notes
                  </Button>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {idea.status !== 'accepted' && (
                  <Button
                    size="sm"
                    onClick={() => handleStatusChange('accepted')}
                    disabled={saving}
                  >
                    <Check size={14} />
                    Accept
                  </Button>
                )}
                {idea.status !== 'reviewed' && idea.status !== 'accepted' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleStatusChange('reviewed')}
                    disabled={saving}
                  >
                    Mark reviewed
                  </Button>
                )}
                {idea.status !== 'archived' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleStatusChange('archived')}
                    disabled={saving}
                  >
                    <Archive size={14} />
                    Archive
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const res = await fetch(`/api/ideas/${idea.id}`, { method: 'DELETE' });
                      if (res.ok) {
                        toast.success('Idea removed.');
                        onDelete(idea.id);
                      } else {
                        toast.error('Failed to remove idea.');
                      }
                    } catch {
                      toast.error('Something went wrong.');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={14} />
                  Remove
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
