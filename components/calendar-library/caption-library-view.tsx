'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ComboSelect } from '@/components/ui/combo-select';
import { TagInput } from '@/components/ui/tag-input';

interface ClientRow {
  id: string;
  name: string;
  slug: string;
}

interface SavedCaption {
  id: string;
  title: string;
  caption_text: string;
  hashtags: string[] | null;
  created_at: string;
}

export function CaptionLibraryView({
  clients,
  initialClientId,
}: {
  clients: ClientRow[];
  initialClientId: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [clientId, setClientId] = useState<string | null>(initialClientId);
  const [cta, setCta] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedCaption[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingBoiler, setSavingBoiler] = useState(false);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  // Load whenever client changes.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [bp, sc] = await Promise.all([
          fetch(`/api/clients/${clientId}/brand-profile`).then((r) => r.json()),
          fetch(`/api/scheduler/saved-captions?client_id=${clientId}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setCta((bp?.profile?.caption_cta as string | null) ?? '');
        setHashtags(((bp?.profile?.caption_hashtags as string[] | null) ?? []) ?? []);
        setSaved((sc?.captions as SavedCaption[]) ?? []);
      } catch {
        if (!cancelled) toast.error('Failed to load library');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Sync selected client to URL.
  useEffect(() => {
    if (!selectedClient) return;
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set('client', selectedClient.slug);
    router.replace(`/admin/calendar/library?${next.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.slug]);

  async function saveBoilerplate() {
    if (!clientId) return;
    setSavingBoiler(true);
    const res = await fetch(`/api/clients/${clientId}/brand-profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption_cta: cta.trim().length === 0 ? null : cta,
        caption_hashtags: hashtags,
      }),
    });
    setSavingBoiler(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? 'Save failed');
      return;
    }
    toast.success('Boilerplate saved');
  }

  async function addSaved(payload: {
    title: string;
    caption_text: string;
    hashtags: string[];
  }): Promise<boolean> {
    if (!clientId) return false;
    const res = await fetch('/api/scheduler/saved-captions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, ...payload }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? 'Save failed');
      return false;
    }
    setSaved((prev) => [body.caption, ...prev]);
    toast.success('Caption saved');
    return true;
  }

  async function removeSaved(id: string) {
    const res = await fetch(`/api/scheduler/saved-captions?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Delete failed');
      return;
    }
    setSaved((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <header>
        <h1 className="text-xl font-semibold text-text-primary">Caption library</h1>
        <p className="mt-1 text-sm text-text-muted">
          Per-client CTA + hashtags get appended to every generated caption. Saved captions guide the model&apos;s tone.
        </p>
      </header>

      <ComboSelect
        label="Brand"
        options={clients.map((c) => ({ value: c.id, label: c.name }))}
        value={clientId ?? ''}
        onChange={setClientId}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading library…
        </div>
      ) : !clientId ? (
        <p className="text-sm text-text-muted">Pick a brand to start.</p>
      ) : (
        <>
          <BoilerplatePanel
            cta={cta}
            hashtags={hashtags}
            onCtaChange={setCta}
            onHashtagsChange={setHashtags}
            onSave={saveBoilerplate}
            saving={savingBoiler}
          />
          <SavedCaptionsPanel saved={saved} onAdd={addSaved} onRemove={removeSaved} />
        </>
      )}
    </div>
  );
}

function BoilerplatePanel({
  cta,
  hashtags,
  onCtaChange,
  onHashtagsChange,
  onSave,
  saving,
}: {
  cta: string;
  hashtags: string[];
  onCtaChange: (v: string) => void;
  onHashtagsChange: (v: string[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <section className="rounded-xl border border-nativz-border bg-surface">
      <header className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Boilerplate</h2>
          <p className="text-xs text-text-muted">Appended verbatim to every generated caption.</p>
        </div>
        <Button onClick={onSave} disabled={saving} size="sm">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </Button>
      </header>
      <div className="space-y-4 px-4 py-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">CTA</label>
          <textarea
            value={cta}
            onChange={(e) => onCtaChange(e.target.value)}
            rows={3}
            placeholder="Visit nativz.io to book a strategy call."
            className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Default hashtags</label>
          <TagInput
            value={hashtags}
            onChange={onHashtagsChange}
            placeholder="Add hashtag, then Enter…"
            maxTags={30}
          />
          <p className="mt-1 text-xs text-text-muted">No leading &quot;#&quot; — added when posted.</p>
        </div>
      </div>
    </section>
  );
}

function SavedCaptionsPanel({
  saved,
  onAdd,
  onRemove,
}: {
  saved: SavedCaption[];
  onAdd: (payload: { title: string; caption_text: string; hashtags: string[] }) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    if (!title.trim() || !text.trim()) {
      toast.error('Title + caption text required');
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onAdd({ title: title.trim(), caption_text: text.trim(), hashtags: tags });
      if (ok) {
        setTitle('');
        setText('');
        setTags([]);
        setOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-nativz-border bg-surface">
      <header className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Saved captions</h2>
          <p className="text-xs text-text-muted">
            Examples shown to the AI as voice/tone reference. Don&apos;t paste boilerplate here — keep these short and punchy.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          <Plus size={14} /> Add
        </Button>
      </header>

      {open && (
        <div className="space-y-3 border-b border-nativz-border bg-background/50 px-4 py-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Hook style A)"
            className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Caption text"
            className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <TagInput value={tags} onChange={setTags} placeholder="Hashtags (optional)" maxTags={20} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={submitting}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save caption
            </Button>
          </div>
        </div>
      )}

      {saved.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-text-muted">
          No saved captions yet. Add a few to coach the AI&apos;s tone.
        </p>
      ) : (
        <ul className="divide-y divide-nativz-border">
          {saved.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{s.title}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-text-secondary">{s.caption_text}</p>
                {(s.hashtags?.length ?? 0) > 0 && (
                  <p className="mt-1 text-xs text-text-muted">
                    {s.hashtags!.map((h) => `#${h}`).join(' ')}
                  </p>
                )}
              </div>
              <button
                onClick={() => onRemove(s.id)}
                className="text-text-muted transition-colors hover:text-danger"
                aria-label="Delete saved caption"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
