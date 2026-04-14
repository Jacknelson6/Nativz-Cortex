'use client';

import { useEffect, useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import type { EmailTemplate, EmailTemplateCategory } from '@/lib/email/types';
import { EmailTemplateRail } from './email-template-rail';
import { EmailBodyPreview } from './email-body-preview';
import { cn } from '@/lib/utils/cn';

export interface Recipient {
  id: string;
  email: string | null;
  full_name: string | null;
}

type Mode = 'send' | 'edit-template';

function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60_000); // +1h
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EmailComposerModal({
  open,
  onClose,
  recipients,
}: {
  open: boolean;
  onClose: () => void;
  recipients: Recipient[];
}) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);

  const [mode, setMode] = useState<Mode>('send');
  const [editTemplate, setEditTemplate] = useState<EmailTemplate | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<EmailTemplateCategory>('general');

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');

  useEffect(() => {
    if (!open) return;
    void fetch('/api/admin/email-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates: EmailTemplate[] }) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]));
  }, [open]);

  useEffect(() => {
    if (scheduleOpen && !scheduleAt) setScheduleAt(defaultScheduleValue());
  }, [scheduleOpen, scheduleAt]);

  function pickTemplate(t: EmailTemplate) {
    setActiveTemplateId(t.id || '');
    setSubject(t.subject);
    setBody(t.body_markdown);
    setPreview(false);
    setMode('send');
    setEditTemplate(null);
  }

  function openEdit(t: EmailTemplate) {
    setMode('edit-template');
    setEditTemplate(t);
    setEditName(t.name);
    setEditCategory(t.category);
    setSubject(t.subject);
    setBody(t.body_markdown);
    setActiveTemplateId(t.id);
  }

  function openNew() {
    setMode('edit-template');
    setEditTemplate(null);
    setEditName('');
    setEditCategory('general');
    setSubject('');
    setBody('');
    setActiveTemplateId(null);
  }

  async function deleteTemplate(t: EmailTemplate) {
    if (!t.id) return;
    if (!confirm(`Delete template "${t.name}"? This can't be undone.`)) return;
    const r = await fetch(`/api/admin/email-templates/${t.id}`, { method: 'DELETE' });
    if (r.ok) {
      toast.success('Template deleted');
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      if (activeTemplateId === t.id) {
        setActiveTemplateId(null);
        setSubject('');
        setBody('');
      }
    } else {
      toast.error('Delete failed');
    }
  }

  async function saveTemplate() {
    if (!editName.trim() || !subject.trim() || !body.trim()) {
      toast.error('Name, subject, and body are required');
      return;
    }
    const isNew = !editTemplate;
    const url = isNew ? '/api/admin/email-templates' : `/api/admin/email-templates/${editTemplate!.id}`;
    const method = isNew ? 'POST' : 'PATCH';
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        category: editCategory,
        subject,
        body_markdown: body,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast.error((d as { error?: string }).error ?? 'Save failed');
      return;
    }
    const d = (await r.json()) as { template: EmailTemplate };
    setTemplates((prev) => {
      const without = prev.filter((x) => x.id !== d.template.id);
      return [...without, d.template].sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
    });
    setActiveTemplateId(d.template.id);
    setMode('send');
    setEditTemplate(null);
    toast.success(isNew ? 'Template created' : 'Template saved');
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    if (recipients.length === 0) {
      toast.error('No recipients');
      return;
    }
    setSending(true);
    try {
      if (recipients.length === 1) {
        const r = await fetch(`/api/admin/users/${recipients[0].id}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, body_markdown: body, template_id: activeTemplateId || null }),
        });
        if (r.ok) {
          toast.success(`Sent to ${recipients[0].email ?? recipients[0].full_name}`);
          onClose();
        } else {
          const d = await r.json().catch(() => ({}));
          toast.error((d as { error?: string }).error ?? 'Send failed');
        }
      } else {
        const r = await fetch('/api/admin/users/bulk-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_ids: recipients.map((x) => x.id),
            subject,
            body_markdown: body,
            template_id: activeTemplateId || null,
          }),
        });
        const d = (await r.json().catch(() => ({}))) as {
          sent?: { user_id: string }[];
          failed?: { user_id: string; error: string }[];
        };
        const sentN = d.sent?.length ?? 0;
        const failedN = d.failed?.length ?? 0;
        if (sentN > 0) toast.success(`Sent to ${sentN} recipient${sentN === 1 ? '' : 's'}`);
        if (failedN > 0) toast.error(`${failedN} failed`);
        if (sentN > 0 && failedN === 0) onClose();
      }
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule() {
    if (!subject.trim() || !body.trim() || !scheduleAt) return;
    const sendAtIso = new Date(scheduleAt).toISOString();
    if (new Date(sendAtIso).getTime() < Date.now() + 60_000) {
      toast.error('Pick a time at least 1 minute in the future');
      return;
    }
    setSending(true);
    try {
      if (recipients.length === 1) {
        const r = await fetch(`/api/admin/users/${recipients[0].id}/schedule-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            body_markdown: body,
            template_id: activeTemplateId || null,
            send_at: sendAtIso,
          }),
        });
        if (r.ok) {
          toast.success('Scheduled');
          onClose();
        } else {
          const d = await r.json().catch(() => ({}));
          toast.error((d as { error?: string }).error ?? 'Schedule failed');
        }
      } else {
        const r = await fetch('/api/admin/users/bulk-schedule-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_ids: recipients.map((x) => x.id),
            subject,
            body_markdown: body,
            template_id: activeTemplateId || null,
            send_at: sendAtIso,
          }),
        });
        const d = (await r.json().catch(() => ({}))) as {
          scheduled?: { user_id: string }[];
          failed?: { user_id: string; error: string }[];
        };
        const n = d.scheduled?.length ?? 0;
        const f = d.failed?.length ?? 0;
        if (n > 0) toast.success(`Scheduled ${n} send${n === 1 ? '' : 's'}`);
        if (f > 0) toast.error(`${f} failed`);
        if (n > 0 && f === 0) onClose();
      }
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl border border-nativz-border bg-background shadow-2xl">
        <EmailTemplateRail
          templates={templates}
          activeId={activeTemplateId}
          onPick={pickTemplate}
          onEdit={openEdit}
          onDelete={deleteTemplate}
          onNew={openNew}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-nativz-border px-5 py-3">
            {mode === 'send' ? (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span className="text-text-muted">To:</span>
                {recipients.slice(0, 3).map((r) => (
                  <span key={r.id} className="rounded-full bg-surface-hover px-2.5 py-0.5 text-text-primary">
                    {r.email ?? r.full_name ?? r.id.slice(0, 6)}
                  </span>
                ))}
                {recipients.length > 3 && <span className="text-text-muted">+{recipients.length - 3} more</span>}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Template name"
                  className="rounded-md border border-nativz-border bg-transparent px-2.5 py-1 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
                />
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as EmailTemplateCategory)}
                  className="rounded-md border border-nativz-border bg-transparent px-2 py-1 text-sm text-text-primary focus:border-accent/40 focus:outline-none"
                >
                  <option value="followup">Follow-up</option>
                  <option value="reminder">Reminder</option>
                  <option value="calendar">Calendar</option>
                  <option value="welcome">Welcome</option>
                  <option value="general">General</option>
                </select>
              </div>
            )}
            <button type="button" onClick={onClose} className="rounded p-1 text-text-muted hover:bg-surface-hover">
              <X size={18} />
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full rounded-lg border border-nativz-border bg-transparent px-4 py-2.5 text-base text-text-primary placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPreview((p) => !p)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-text-muted hover:bg-surface-hover hover:text-text-primary"
              >
                {preview ? <EyeOff size={14} /> : <Eye size={14} />}
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {preview ? (
              <EmailBodyPreview body={body} />
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email here. Use merge fields like {{user.first_name}} or {{sender.name}}."
                className="h-80 w-full resize-y rounded-lg border border-nativz-border bg-transparent px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
              />
            )}
          </div>

          {scheduleOpen && mode === 'send' && (
            <div className="flex items-center gap-3 border-t border-nativz-border bg-surface/40 px-5 py-3">
              <label className="text-sm text-text-secondary">Schedule for</label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="rounded-md border border-nativz-border bg-transparent px-3 py-1.5 text-sm text-text-primary focus:border-accent/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSchedule}
                disabled={sending}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {sending ? 'Scheduling…' : 'Schedule send'}
              </button>
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                className="text-sm text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
            </div>
          )}

          <footer className="flex items-center justify-between gap-2 border-t border-nativz-border px-5 py-3">
            {mode === 'edit-template' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('send');
                  setEditTemplate(null);
                }}
                className="rounded-lg px-4 py-2 text-sm text-text-muted hover:bg-surface-hover hover:text-text-primary"
              >
                Back to send
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                Cancel
              </button>
              {mode === 'send' ? (
                <div className="flex items-center overflow-hidden rounded-lg">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !subject.trim() || !body.trim()}
                    className={cn(
                      'px-6 py-2.5 text-sm font-medium text-white transition-colors',
                      sending || !subject.trim() || !body.trim()
                        ? 'cursor-not-allowed bg-accent/50'
                        : 'bg-accent hover:bg-accent/90',
                    )}
                  >
                    {sending ? 'Sending…' : 'Send now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleOpen((v) => !v)}
                    disabled={sending || !subject.trim() || !body.trim()}
                    className={cn(
                      'border-l border-white/20 px-3 py-2.5 text-sm text-white transition-colors',
                      sending || !subject.trim() || !body.trim()
                        ? 'cursor-not-allowed bg-accent/50'
                        : 'bg-accent hover:bg-accent/90',
                    )}
                    title="Schedule for later"
                  >
                    ▾
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={saveTemplate}
                  className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent/90"
                >
                  Save template
                </button>
              )}
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
