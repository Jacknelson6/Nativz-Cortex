'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EMAIL_PLACEHOLDERS } from '@/lib/onboarding/interpolate-email';

type Template = {
  id: string;
  service: string;
  name: string;
  subject: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const CANONICAL_SERVICES = ['SMM', 'Paid Media', 'Editing', 'Affiliates'] as const;

export function EmailTemplatesManager({
  initialTemplates,
}: {
  initialTemplates: Template[];
}) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    const by = new Map<string, Template[]>();
    for (const t of templates) {
      const list = by.get(t.service) ?? [];
      list.push(t);
      by.set(t.service, list);
    }
    return by;
  }, [templates]);

  async function handleCreate(service: string) {
    setCreating(true);
    try {
      const res = await fetch('/api/onboarding/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service,
          name: 'New template',
          subject: 'Welcome, {{client_name}}',
          body: 'Hi {{contact_first_name}},\n\nHere is your onboarding link: {{share_url}}\n\n— Nativz',
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to create');
        return;
      }
      const { template } = await res.json() as { template: Template };
      setTemplates((xs) => [...xs, template]);
      toast.success('Template created');
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(id: string, fields: Partial<Template>) {
    const prev = templates;
    setTemplates((xs) => xs.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    try {
      const res = await fetch(`/api/onboarding/email-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Failed to update');
      setTemplates(prev);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return;
    const prev = templates;
    setTemplates((xs) => xs.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/onboarding/email-templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete');
      setTemplates(prev);
    }
  }

  return (
    <div className="space-y-6">
      <PlaceholderLegend />

      {CANONICAL_SERVICES.map((service) => {
        const list = grouped.get(service) ?? [];
        return (
          <section key={service} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-text-primary">{service}</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleCreate(service)}
                disabled={creating}
              >
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                New template
              </Button>
            </div>

            {list.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-nativz-border/60 px-4 py-6 text-center text-[13px] text-text-muted italic">
                No templates for {service} yet.
              </div>
            ) : (
              <div className="space-y-2">
                {list.map((t) => (
                  <TemplateEditor
                    key={t.id}
                    template={t}
                    onUpdate={(fields) => void handleUpdate(t.id, fields)}
                    onDelete={() => void handleDelete(t.id)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PlaceholderLegend() {
  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface-hover/30 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-2">
        Available placeholders
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
        {EMAIL_PLACEHOLDERS.map((p) => (
          <div key={p.key} className="flex items-baseline gap-2 text-[12px]">
            <code className="font-mono text-accent-text">{p.key}</code>
            <span className="text-text-muted">{p.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({
  template,
  onUpdate,
  onDelete,
}: {
  template: Template;
  onUpdate: (fields: Partial<Template>) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          defaultValue={template.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== template.name) onUpdate({ name: v });
          }}
          className="flex-1 bg-transparent text-[14px] font-semibold text-text-primary focus:outline-none border-b border-transparent focus:border-accent-border/50 pb-0.5 transition-colors"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary transition-colors"
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {open ? 'Collapse' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="Delete template"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {open && (
        <div className="border-t border-nativz-border px-4 py-3 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Subject
            </label>
            <input
              defaultValue={template.subject}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== template.subject) onUpdate({ subject: v });
              }}
              placeholder="Welcome to {{service}}, {{client_name}}"
              className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Body
            </label>
            <textarea
              defaultValue={template.body}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== template.body) onUpdate({ body: v });
              }}
              rows={10}
              placeholder={`Hi {{contact_first_name}},\n\n…`}
              className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-[13px] text-text-primary placeholder-text-muted font-mono leading-relaxed focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-y"
            />
          </div>
        </div>
      )}
    </div>
  );
}
