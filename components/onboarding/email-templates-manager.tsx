'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmailPreview } from '@/components/email/email-preview';
import { EMAIL_PLACEHOLDERS } from '@/lib/onboarding/interpolate-email';
import {
  BLOCK_TYPE_LABELS,
  seedBlocksFromMarkdown,
  type OnboardingBlock,
} from '@/lib/email/templates/onboarding-blocks';

type Template = {
  id: string;
  service: string;
  name: string;
  subject: string;
  body: string;
  blocks: unknown;
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
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [name, setName] = useState(template.name);

  // Rich blocks mode. null means "markdown mode"; array means "blocks mode".
  // Initial state: take whatever's stored; fall back to null (markdown mode).
  const [blocks, setBlocks] = useState<OnboardingBlock[] | null>(() => {
    const b = template.blocks;
    if (Array.isArray(b) && b.length > 0) return b as OnboardingBlock[];
    return null;
  });
  const usingBlocks = blocks !== null;

  function persistBlocks(next: OnboardingBlock[] | null) {
    setBlocks(next);
    onUpdate({ blocks: next as unknown as Template['blocks'] });
  }

  function switchToBlocks() {
    const seeded = seedBlocksFromMarkdown(body || template.body);
    persistBlocks(seeded.length > 0 ? seeded : [{ type: 'hero', heading: 'New email' }]);
  }

  function switchToMarkdown() {
    persistBlocks(null);
  }

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const v = name.trim();
            if (v && v !== template.name) onUpdate({ name: v });
            else setName(template.name);
          }}
          className="flex-1 bg-transparent text-[14px] font-semibold text-text-primary focus:outline-none border-b border-transparent focus:border-accent-border/50 pb-0.5 transition-colors"
        />
        {usingBlocks && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-surface text-accent-text text-[10px] font-semibold px-2.5 py-0.5 ring-1 ring-inset ring-accent/20">
            <Sparkles size={10} />
            Rich
          </span>
        )}
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
        <div className="border-t border-nativz-border px-4 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5">
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onBlur={() => {
                  const v = subject.trim();
                  if (v && v !== template.subject) onUpdate({ subject: v });
                  else if (!v) setSubject(template.subject);
                }}
                placeholder="Welcome to {{service}}, {{client_name}}"
                className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Mode toggle */}
            <div className="inline-flex rounded-full border border-nativz-border bg-surface p-0.5 text-[11px] font-medium">
              <button
                type="button"
                onClick={switchToMarkdown}
                className={`rounded-full px-3 py-1 transition-colors ${!usingBlocks ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:text-text-primary'}`}
              >
                Markdown
              </button>
              <button
                type="button"
                onClick={switchToBlocks}
                className={`rounded-full px-3 py-1 transition-colors ${usingBlocks ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:text-text-primary'}`}
              >
                Rich blocks
              </button>
            </div>

            {usingBlocks ? (
              <BlockEditor blocks={blocks!} onChange={persistBlocks} />
            ) : (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                  Body
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onBlur={() => {
                    const v = body.trim();
                    if (v && v !== template.body) onUpdate({ body: v });
                    else if (!v) setBody(template.body);
                  }}
                  rows={14}
                  placeholder={`Hi {{contact_first_name}},\n\n…`}
                  className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-[13px] text-text-primary placeholder-text-muted font-mono leading-relaxed focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-y"
                />
                <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">
                  Supports markdown-lite: <code className="text-accent-text">#</code> headings,{' '}
                  <code className="text-accent-text">**bold**</code>,{' '}
                  <code className="text-accent-text">- bullets</code>,{' '}
                  <code className="text-accent-text">[link](url)</code>.
                </p>
              </div>
            )}
          </div>

          {/* Right column — live preview. Uses blocks when set; falls back to body. */}
          <EmailPreview
            input={{
              kind: 'onboarding',
              subject,
              body,
              blocks: usingBlocks ? (blocks as unknown as Record<string, unknown>[]) : null,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Block editor ─────────────────────────────────────────────────────────

function BlockEditor({
  blocks,
  onChange,
}: {
  blocks: OnboardingBlock[];
  onChange: (next: OnboardingBlock[]) => void;
}) {
  function updateAt(i: number, next: OnboardingBlock) {
    onChange(blocks.map((b, idx) => (idx === i ? next : b)));
  }
  function removeAt(i: number) {
    onChange(blocks.filter((_, idx) => idx !== i));
  }
  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...blocks];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  }
  function moveDown(i: number) {
    if (i === blocks.length - 1) return;
    const next = [...blocks];
    [next[i + 1], next[i]] = [next[i], next[i + 1]];
    onChange(next);
  }
  function add(type: OnboardingBlock['type']) {
    const seed: Record<OnboardingBlock['type'], OnboardingBlock> = {
      hero: { type: 'hero', heading: 'New heading' },
      paragraph: { type: 'paragraph', text: 'Write a paragraph here.' },
      cta: { type: 'cta', label: 'Open onboarding \u2192', url: '{{share_url}}' },
      features: { type: 'features', items: ['First item', 'Second item', 'Third item'] },
      callout: { type: 'callout', label: 'Heads up', text: 'This is the important bit.' },
      divider: { type: 'divider' },
      signature: { type: 'signature', text: '\u2013 Nativz' },
    };
    onChange([...blocks, seed[type]]);
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {blocks.map((b, i) => (
          <li
            key={i}
            className="rounded-lg border border-nativz-border bg-surface-hover/30 overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-nativz-border/70 bg-surface-hover/50">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                {BLOCK_TYPE_LABELS[b.type]}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  className="rounded p-1 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
                  aria-label="Move up"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(i)}
                  disabled={i === blocks.length - 1}
                  className="rounded p-1 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
                  aria-label="Move down"
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="rounded p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  aria-label="Remove block"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <div className="px-3 py-2.5">
              <BlockBody block={b} onChange={(next) => updateAt(i, next)} />
            </div>
          </li>
        ))}
      </ul>

      <AddBlockMenu onAdd={add} />
    </div>
  );
}

function AddBlockMenu({ onAdd }: { onAdd: (type: OnboardingBlock['type']) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={12} />
        Add block
      </Button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-nativz-border bg-surface shadow-xl py-1">
          {(Object.keys(BLOCK_TYPE_LABELS) as OnboardingBlock['type'][]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => { setOpen(false); onAdd(type); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors text-left"
            >
              {BLOCK_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockBody({
  block,
  onChange,
}: {
  block: OnboardingBlock;
  onChange: (next: OnboardingBlock) => void;
}) {
  switch (block.type) {
    case 'hero':
      return (
        <div className="space-y-2">
          <input
            value={block.heading}
            onChange={(e) => onChange({ ...block, heading: e.target.value })}
            placeholder="Big bold headline"
            className="block w-full rounded-md border border-nativz-border bg-surface px-3 py-1.5 text-[14px] font-semibold text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            value={block.subtext ?? ''}
            onChange={(e) => onChange({ ...block, subtext: e.target.value || undefined })}
            placeholder="Optional lead paragraph"
            className="block w-full rounded-md border border-nativz-border bg-surface px-3 py-1.5 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      );
    case 'paragraph':
      return (
        <textarea
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          rows={3}
          placeholder="Write a paragraph. Supports **bold**, [links](url)."
          className="block w-full rounded-md border border-nativz-border bg-surface px-3 py-2 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-y"
        />
      );
    case 'cta':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={block.label}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            placeholder="Button label"
            className="block w-full rounded-md border border-nativz-border bg-surface px-3 py-1.5 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            placeholder="https://... or {{share_url}}"
            className="block w-full rounded-md border border-nativz-border bg-surface px-3 py-1.5 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      );
    case 'features':
      return (
        <div className="space-y-2">
          {block.items.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-muted w-4">{i + 1}.</span>
              <input
                value={item}
                onChange={(e) => {
                  const next = [...block.items];
                  next[i] = e.target.value;
                  onChange({ ...block, items: next });
                }}
                className="flex-1 rounded-md border border-nativz-border bg-surface px-3 py-1 text-[13px] text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => onChange({ ...block, items: block.items.filter((_, idx) => idx !== i) })}
                className="rounded p-1 text-text-muted hover:text-red-400 transition-colors"
                aria-label="Remove item"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ ...block, items: [...block.items, 'New item'] })}
          >
            <Plus size={11} />
            Add item
          </Button>
        </div>
      );
    case 'callout':
      return (
        <div className="space-y-2">
          <input
            value={block.label}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            placeholder="Label (uppercase small)"
            className="block w-full rounded-md border border-nativz-border bg-surface px-3 py-1.5 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <textarea
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            rows={2}
            placeholder="Callout body"
            className="block w-full rounded-md border border-nativz-border bg-surface px-3 py-2 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-y"
          />
        </div>
      );
    case 'divider':
      return <p className="text-[12px] text-text-muted italic">Horizontal rule \u2014 no content.</p>;
    case 'signature':
      return (
        <input
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="\u2013 Nativz"
          className="block w-full rounded-md border border-nativz-border bg-surface px-3 py-1.5 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      );
  }
}
