'use client';

import { Pencil, Trash2, Plus } from 'lucide-react';
import type { EmailTemplate, EmailTemplateCategory } from '@/lib/email/types';
import { cn } from '@/lib/utils/cn';

const CATEGORY_LABELS: Record<EmailTemplateCategory, string> = {
  followup: 'Follow-up',
  reminder: 'Reminders',
  calendar: 'Calendar',
  welcome: 'Welcome',
  general: 'General',
};

const CATEGORY_ORDER: EmailTemplateCategory[] = ['followup', 'reminder', 'calendar', 'welcome', 'general'];

export function EmailTemplateRail({
  templates,
  activeId,
  onPick,
  onEdit,
  onDelete,
  onNew,
}: {
  templates: EmailTemplate[];
  activeId: string | null;
  onPick: (t: EmailTemplate) => void;
  onEdit: (t: EmailTemplate) => void;
  onDelete: (t: EmailTemplate) => void;
  onNew: () => void;
}) {
  const byCategory = new Map<EmailTemplateCategory, EmailTemplate[]>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);
  for (const t of templates) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-nativz-border bg-surface/50">
      <div className="flex-1 overflow-y-auto p-3">
        <button
          type="button"
          onClick={() =>
            onPick({
              id: '',
              name: 'Blank',
              category: 'general',
              subject: '',
              body_markdown: '',
              updated_at: '',
              created_by: null,
            })
          }
          className={cn(
            'mb-3 w-full rounded-md border border-dashed border-nativz-border px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            activeId === '' && 'border-accent/50 bg-accent/10 text-text-primary',
          )}
        >
          Blank
        </button>

        {CATEGORY_ORDER.map((cat) => {
          const list = byCategory.get(cat) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={cat} className="mb-3">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">{CATEGORY_LABELS[cat]}</p>
              <ul className="space-y-0.5">
                {list.map((t) => (
                  <li
                    key={t.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-surface-hover',
                      activeId === t.id && 'bg-accent/10',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onPick(t)}
                      className="min-w-0 flex-1 truncate text-left text-sm text-text-secondary hover:text-text-primary"
                    >
                      {t.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface hover:text-text-primary group-hover:flex"
                      title="Edit template"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(t)}
                      className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface hover:text-red-400 group-hover:flex"
                      title="Delete template"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onNew}
        className="flex items-center justify-center gap-1.5 border-t border-nativz-border px-3 py-3 text-sm text-accent-text hover:bg-surface-hover"
      >
        <Plus size={14} /> New template
      </button>
    </aside>
  );
}
