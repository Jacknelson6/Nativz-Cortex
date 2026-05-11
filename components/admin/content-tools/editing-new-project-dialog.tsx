'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  CalendarRange,
  Clock,
  FolderInput,
  Image as ImageIcon,
  Loader2,
  Plus,
  Scissors,
  Search,
  Video,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ClientLogo } from '@/components/clients/client-logo';
import {
  EDITING_TYPE_LABEL,
  type EditingProjectType,
} from '@/lib/editing/types';

/**
 * Unified "Upload content" entry point. The same dialog mints either an
 * editing project (one-off cutdowns / paid creatives where editors work
 * inside a single deliverable row) or a content calendar (Drive folder
 * full of finals -> AI captions + scheduled posts). A pill at the top
 * picks the branch; everything below swaps to match.
 *
 * Why one dialog instead of two CTAs:
 *   - The header surface in content-tools is the obvious "make a new
 *     thing" landing pad. Jack wanted one button there.
 *   - Brand pick + dialog framing are identical; only the trailing fields
 *     differ. A toggle is cheaper than two separate dialogs and keeps the
 *     mental model "I'm uploading content" instead of "I'm picking a
 *     workflow."
 */

type UploadKind = 'editing' | 'calendar';

interface ClientOption {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
}

const TYPE_OPTIONS: { value: EditingProjectType; label: string }[] = (
  Object.keys(EDITING_TYPE_LABEL) as EditingProjectType[]
).map((value) => ({ value, label: EDITING_TYPE_LABEL[value] }));

export function EditingNewProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string, kind: UploadKind) => void;
}) {
  const [kind, setKind] = useState<UploadKind>('editing');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Editing-project fields
  const [name, setName] = useState('');
  const [type, setType] = useState<EditingProjectType>('organic_content');
  const [notes, setNotes] = useState('');

  // Calendar fields
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const endOfStartMonth = useMemo(() => {
    const now = new Date();
    const last = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    );
    return last.toISOString().slice(0, 10);
  }, []);
  const [folderUrl, setFolderUrl] = useState('');
  const [mediaType, setMediaType] = useState<'video' | 'image'>('video');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(endOfStartMonth);
  const [defaultTime, setDefaultTime] = useState('10:00');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/clients', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load clients');
        const data = (await res.json()) as ClientOption[];
        if (!cancelled) setClients(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load clients');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function reset() {
    setKind('editing');
    setClientId('');
    setName('');
    setType('organic_content');
    setNotes('');
    setFolderUrl('');
    setMediaType('video');
    setStartDate(today);
    setEndDate(endOfStartMonth);
    setDefaultTime('10:00');
  }

  async function submit() {
    if (!clientId) return toast.error('Pick a brand first');
    if (kind === 'editing') {
      if (!name.trim()) return toast.error('Give the project a name');
      setSubmitting(true);
      try {
        const res = await fetch('/api/admin/editing/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            name: name.trim(),
            project_type: type,
            notes: notes.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { detail?: string } | null;
          throw new Error(body?.detail ?? 'Create failed');
        }
        const data = (await res.json()) as { id: string };
        reset();
        onCreated(data.id, 'editing');
        toast.success('Project created');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Create failed');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Calendar branch
    if (!folderUrl.trim()) return toast.error('Drive folder URL required');
    setSubmitting(true);
    let success = false;
    try {
      const res = await fetch('/api/calendar/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          driveFolderUrl: folderUrl.trim(),
          mediaType,
          startDate,
          endDate,
          defaultPostTime: defaultTime,
        }),
      });
      const data = (await res.json()) as { drop?: { id: string }; error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to create content calendar',
        );
      }
      if (!data.drop?.id) throw new Error('Server did not return a calendar id');
      success = true;
      reset();
      onCreated(data.drop.id, 'calendar');
      toast.success('Content calendar started');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create content calendar');
    } finally {
      // The editing branch always clears the flag; for the calendar branch
      // we keep the spinner on the success path because the dialog is
      // about to unmount via onCreated -> shell navigation.
      if (!success) setSubmitting(false);
    }
  }

  const submitLabel =
    kind === 'editing'
      ? submitting
        ? 'Creating...'
        : 'Create project'
      : submitting
        ? 'Creating...'
        : 'Create calendar';

  return (
    <Dialog open={open} onClose={onClose} title="Upload content" maxWidth="lg">
      <div className="space-y-4">
        <KindToggle value={kind} onChange={setKind} disabled={submitting} />

        <ClientField
          clients={clients}
          value={clientId}
          onChange={setClientId}
        />

        {kind === 'editing' ? (
          <EditingFields
            name={name}
            setName={setName}
            type={type}
            setType={setType}
            notes={notes}
            setNotes={setNotes}
          />
        ) : (
          <CalendarFields
            folderUrl={folderUrl}
            setFolderUrl={setFolderUrl}
            mediaType={mediaType}
            setMediaType={setMediaType}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            defaultTime={defaultTime}
            setDefaultTime={setDefaultTime}
            submitting={submitting}
          />
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            {submitLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function KindToggle({
  value,
  onChange,
  disabled,
}: {
  value: UploadKind;
  onChange: (next: UploadKind) => void;
  disabled: boolean;
}) {
  const options: { value: UploadKind; label: string; icon: React.ReactNode; hint: string }[] = [
    {
      value: 'editing',
      label: 'Editing project',
      icon: <Scissors size={14} />,
      hint: 'One-off cutdowns, paid creatives, or any deliverable where editors collaborate on a single batch.',
    },
    {
      value: 'calendar',
      label: 'Content calendar',
      icon: <CalendarRange size={14} />,
      hint: 'Drive folder of finals — we caption every file and schedule them across a date range.',
    },
  ];
  const active = options.find((o) => o.value === value);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-text-secondary">
        What are you uploading?
      </label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const isActive = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-accent bg-accent/10 text-accent-text'
                  : 'border-nativz-border bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              {o.icon}
              {o.label}
            </button>
          );
        })}
      </div>
      {active && (
        <p className="text-xs text-text-muted">{active.hint}</p>
      )}
    </div>
  );
}

function EditingFields({
  name,
  setName,
  type,
  setType,
  notes,
  setNotes,
}: {
  name: string;
  setName: (v: string) => void;
  type: EditingProjectType;
  setType: (v: EditingProjectType) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  return (
    <>
      <Field label="Project name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Q2 Reel batch 3"
          className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_3px_var(--focus-ring)]"
        />
      </Field>

      <Field label="Type">
        <Select
          id="editing-type"
          value={type}
          onChange={(e) => setType(e.target.value as EditingProjectType)}
          options={TYPE_OPTIONS}
        />
      </Field>

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Lean into the founder voice. 6 cuts total. Keep under 28s each."
          className="block w-full resize-none rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_3px_var(--focus-ring)]"
        />
      </Field>
    </>
  );
}

function CalendarFields({
  folderUrl,
  setFolderUrl,
  mediaType,
  setMediaType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  defaultTime,
  setDefaultTime,
  submitting,
}: {
  folderUrl: string;
  setFolderUrl: (v: string) => void;
  mediaType: 'video' | 'image';
  setMediaType: (v: 'video' | 'image') => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  defaultTime: string;
  setDefaultTime: (v: string) => void;
  submitting: boolean;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-text-secondary">Media type</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMediaType('video')}
            disabled={submitting}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              mediaType === 'video'
                ? 'border-accent bg-accent/10 text-accent-text'
                : 'border-nativz-border bg-surface text-text-secondary hover:text-text-primary'
            }`}
          >
            <Video size={14} />
            Videos
          </button>
          <button
            type="button"
            onClick={() => setMediaType('image')}
            disabled={submitting}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              mediaType === 'image'
                ? 'border-accent bg-accent/10 text-accent-text'
                : 'border-nativz-border bg-surface text-text-secondary hover:text-text-primary'
            }`}
          >
            <ImageIcon size={14} />
            Images
          </button>
        </div>
        <p className="text-xs text-text-muted">
          {mediaType === 'video'
            ? 'Each video becomes one post. We auto-caption from the transcript and brand voice.'
            : 'Each image becomes one post. Group multiple images into a carousel on the review board.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-text-secondary">
          Google Drive folder
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2">
          <FolderInput size={14} className="shrink-0 text-text-muted" />
          <input
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none"
            disabled={submitting}
          />
        </div>
        <p className="text-xs text-text-muted">
          The folder must be shared so your connected Google account can read it. We&rsquo;ll caption every {mediaType === 'video' ? 'video' : 'image'} in the folder and schedule them across the date range.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Start date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          disabled={submitting}
        />
        <Input
          label="End date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-text-secondary">
          Default post time (UTC)
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2">
          <Clock size={14} className="shrink-0 text-text-muted" />
          <input
            type="time"
            value={defaultTime}
            onChange={(e) => setDefaultTime(e.target.value)}
            className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
            disabled={submitting}
          />
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

function ClientField({
  clients,
  value,
  onChange,
}: {
  clients: ClientOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const selected = clients.find((c) => c.id === value);

  // Filter on a normalized substring match. Brands lists run 30+
  // entries deep so a search bar shaves the cognitive load down to
  // "type the first few letters and hit enter on the first row."
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-text-secondary">Brand</label>
      {selected ? (
        <button
          type="button"
          onClick={() => {
            onChange('');
            setQuery('');
          }}
          className="flex w-full items-center gap-2.5 rounded-lg border border-accent/40 bg-accent-surface px-3 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-surface/90"
        >
          <ClientLogo
            src={selected.logo_url}
            name={selected.name}
            size="sm"
          />
          <span className="flex-1 text-left">{selected.name}</span>
          <span className="text-[11px] text-text-muted">change</span>
        </button>
      ) : (
        <div className="overflow-hidden rounded-lg border border-nativz-border bg-surface">
          <div className="relative border-b border-nativz-border">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brands"
              autoFocus
              className="block w-full bg-transparent py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {clients.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-text-muted">
                <Building2 size={14} />
                <span>Loading brands...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-text-muted">
                No brands match &ldquo;{query}&rdquo;
              </div>
            ) : (
              <ul>
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onChange(c.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
                    >
                      <ClientLogo src={c.logo_url} name={c.name} size="sm" />
                      <span className="flex-1 truncate">{c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
