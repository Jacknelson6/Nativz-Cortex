'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { FileText, Plus, Save, Trash2 } from 'lucide-react';
import { LabeledInput, ModalShell } from './contacts-tab';
import { SkeletonRows } from '@/components/ui/loading-skeletons';
import { Button } from '@/components/ui/button';

type Category = 'followup' | 'reminder' | 'calendar' | 'welcome' | 'general';

type Template = {
  id: string;
  name: string;
  category: Category;
  subject: string;
  body_markdown: string;
  updated_at: string;
};

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'followup', label: 'Follow-up' },
  { key: 'reminder', label: 'Reminder' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'welcome', label: 'Welcome' },
  { key: 'general', label: 'General' },
];

export function TemplatesTab() {
  const [selected, setSelected] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, mutate } = useSWR<{ templates: Template[] }>(
    '/api/admin/email-templates',
  );
  const templates = data?.templates ?? [];
  const load = () => {
    void mutate();
  };

  async function save(tpl: Partial<Template> & { id?: string }) {
    const url = tpl.id ? `/api/admin/email-templates/${tpl.id}` : '/api/admin/email-templates';
    const method = tpl.id ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        tpl.id
          ? {
              name: tpl.name,
              category: tpl.category,
              subject: tpl.subject,
              body_markdown: tpl.body_markdown,
            }
          : tpl,
      ),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'Failed to save template');
      return;
    }
    toast.success(tpl.id ? 'Template updated' : 'Template created');
    setSelected(null);
    setCreating(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    const res = await fetch(`/api/admin/email-templates/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'Failed to delete template');
      return;
    }
    toast.success('Template deleted');
    setSelected(null);
    load();
  }

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
      <header className="flex items-center justify-end gap-3 px-5 py-3 border-b border-nativz-border">
        <p className="mr-auto text-xs text-text-muted tabular-nums">
          {templates.length} template{templates.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90"
        >
          <Plus size={13} />
          Create template
        </button>
      </header>

      {error ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-rose-500">Couldn&apos;t load templates.</p>
          <button
            type="button"
            onClick={load}
            className="rounded-full border border-nativz-border bg-background px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            Retry
          </button>
        </div>
      ) : isLoading && templates.length === 0 ? (
        <SkeletonRows count={4} withAvatar={false} />
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-surface border border-nativz-border">
            <FileText size={22} className="text-accent-text" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">No templates yet</h3>
            <p className="mt-1 max-w-md text-sm text-text-muted">
              Create reusable email templates for your outreach campaigns.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
          >
            <Plus size={14} />
            Create template
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-nativz-border">
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <button
                type="button"
                onClick={() => setSelected(tpl)}
                className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-surface/40 focus:outline-none focus:bg-surface/40"
              >
                <span className="inline-flex items-center rounded-full bg-accent-surface border border-nativz-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-text">
                  {tpl.category}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">{tpl.name}</p>
                  <p className="text-xs text-text-muted truncate">{tpl.subject || 'No subject'}</p>
                </div>
                <time className="text-[11px] text-text-muted tabular-nums shrink-0">
                  {new Date(tpl.updated_at).toLocaleDateString()}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(creating || selected) && (
        <TemplateEditor
          template={selected}
          onClose={() => {
            setSelected(null);
            setCreating(false);
          }}
          onSave={save}
          onDelete={selected ? () => remove(selected.id) : undefined}
        />
      )}
    </section>
  );
}

function TemplateEditor({
  template,
  onClose,
  onSave,
  onDelete,
}: {
  template: Template | null;
  onClose: () => void;
  onSave: (tpl: Partial<Template> & { id?: string }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [category, setCategory] = useState<Category>(template?.category ?? 'general');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body_markdown ?? '');

  return (
    <ModalShell title={template ? 'Edit template' : 'New template'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_150px] gap-3">
          <LabeledInput
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Follow-up — day 3"
            autoFocus
          />
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Category
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <LabeledInput
          label="Subject"
          value={subject}
          onChange={setSubject}
          placeholder="Quick follow-up, {{user.first_name}}"
        />
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
            Body (markdown)
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            placeholder={'Hey {{user.first_name}},\n\n…\n\n– {{sender.name}}'}
            className="w-full rounded-xl border border-nativz-border bg-background p-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <p className="mt-1.5 text-[11px] text-text-muted">
            Merge fields: <code>{'{{user.first_name}}'}</code>, <code>{'{{user.email}}'}</code>,{' '}
            <code>{'{{client.name}}'}</code>, <code>{'{{sender.name}}'}</code>
          </p>
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        {onDelete ? (
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 size={12} />
            Delete
          </Button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onSave({
                id: template?.id,
                name,
                category,
                subject,
                body_markdown: body,
              })
            }
            disabled={!name.trim()}
          >
            <Save size={12} />
            {template ? 'Save changes' : 'Create template'}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
