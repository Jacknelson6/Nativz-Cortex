'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  CalendarRange,
  Loader2,
  Plus,
  Scissors,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScheduleRangePicker } from '@/components/ui/schedule-range-picker';
import { ClientLogo } from '@/components/clients/client-logo';
import {
  runCalendarUploads,
  type CalendarUploadFile,
  type CalendarUploadProgress,
} from '@/lib/calendar/upload-store';

/**
 * Unified "Upload content" entry point. The same dialog mints either an
 * editing project (one-off cutdowns / paid creatives where editors work
 * inside a single deliverable row) or a content calendar (direct file
 * uploads -> AI captions + scheduled posts). A pill at the top picks the
 * branch; everything below swaps to match.
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

const MAX_FILES = 60;

type CalendarMediaType = 'video' | 'image' | 'mixed' | null;

function detectMediaType(file: File): 'video' | 'image' | null {
  const m = file.type.toLowerCase();
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('image/')) return 'image';
  return null;
}

function summarizeMediaType(files: File[]): CalendarMediaType {
  if (files.length === 0) return null;
  let hasVideo = false;
  let hasImage = false;
  for (const f of files) {
    const t = detectMediaType(f);
    if (t === 'video') hasVideo = true;
    else if (t === 'image') hasImage = true;
    else return 'mixed'; // unsupported type counts as a mix conflict
  }
  if (hasVideo && hasImage) return 'mixed';
  return hasVideo ? 'video' : 'image';
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

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

  // Editing-project fields. Type is no longer exposed: the kind toggle
  // ("Editing project" vs "Content calendar") fully resolves project_type,
  // so the editing branch hardcodes 'editing' on submit.
  const [name, setName] = useState('');
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
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Map<number, CalendarUploadProgress>>(new Map());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(endOfStartMonth);
  // Media type is inferred from the selected files. Default post time is
  // pinned to 12:00 America/Chicago by `lib/calendar/distribute-slots.ts`,
  // so we don't expose either control here.

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
    setNotes('');
    setFiles([]);
    setProgress(new Map());
    setStartDate(today);
    setEndDate(endOfStartMonth);
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
            project_type: 'editing',
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
    if (files.length === 0) return toast.error('Add at least one video or image');
    const mediaSummary = summarizeMediaType(files);
    if (mediaSummary === 'mixed') {
      return toast.error('Upload either all videos or all images, not both.');
    }
    if (!mediaSummary) {
      return toast.error('Unsupported file type — videos and images only.');
    }

    setSubmitting(true);
    let success = false;
    try {
      const manifest = files.map((f) => ({
        filename: f.name,
        mime_type: f.type || 'application/octet-stream',
        size_bytes: f.size,
      }));
      const res = await fetch('/api/calendar/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          files: manifest,
          startDate,
          endDate,
          // Pinned to 12:00 America/Chicago. distribute-slots ignores this
          // value and forces 12:00 Central regardless, but we still send
          // it so the existing Zod schema accepts the body.
          defaultPostTime: '12:00',
        }),
      });
      const data = (await res.json()) as {
        drop?: { id: string };
        uploads?: Array<{
          index: number;
          video_id: string;
          asset_id?: string;
          storage_path: string;
          public_url: string;
          upload_url: string;
        }>;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to create content calendar',
        );
      }
      if (!data.drop?.id || !data.uploads) {
        throw new Error('Server did not return upload tickets');
      }

      const uploads: CalendarUploadFile[] = data.uploads.map((u) => ({
        index: u.index,
        file: files[u.index],
        video_id: u.video_id,
        asset_id: u.asset_id,
        storage_path: u.storage_path,
        public_url: u.public_url,
        upload_url: u.upload_url,
      }));

      // Seed progress map so the UI immediately shows one bar per file.
      const seeded = new Map<number, CalendarUploadProgress>();
      for (const u of uploads) {
        seeded.set(u.index, { index: u.index, progress: 0, state: 'queued' });
      }
      setProgress(seeded);

      await runCalendarUploads({
        dropId: data.drop.id,
        uploads,
        onProgress: (next) =>
          setProgress((prev) => {
            const copy = new Map(prev);
            copy.set(next.index, next);
            return copy;
          }),
      });

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
        ? 'Uploading...'
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
            notes={notes}
            setNotes={setNotes}
          />
        ) : (
          <CalendarFields
            files={files}
            setFiles={setFiles}
            progress={progress}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
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
      hint: 'Upload finished videos or images. We caption every file and schedule them across a date range.',
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
  notes,
  setNotes,
}: {
  name: string;
  setName: (v: string) => void;
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
  files,
  setFiles,
  progress,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  submitting,
}: {
  files: File[];
  setFiles: (next: File[]) => void;
  progress: Map<number, CalendarUploadProgress>;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  submitting: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const mediaSummary = summarizeMediaType(files);

  function pushFiles(incoming: File[]) {
    if (incoming.length === 0) return;
    const combined = [...files, ...incoming].slice(0, MAX_FILES);
    if (combined.length === files.length) {
      toast.error(`Max ${MAX_FILES} files per calendar`);
      return;
    }
    if (files.length + incoming.length > MAX_FILES) {
      toast.error(`Only the first ${MAX_FILES} files were added`);
    }
    setFiles(combined);
  }

  return (
    <>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-text-secondary">
          Content
        </label>

        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const list = e.target.files;
            if (!list) return;
            pushFiles(Array.from(list));
            // Reset so re-picking the same file fires onChange.
            if (inputRef.current) inputRef.current.value = '';
          }}
        />

        <button
          type="button"
          disabled={submitting}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!submitting) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (submitting) return;
            const list = Array.from(e.dataTransfer.files).filter(
              (f) => f.type.startsWith('video/') || f.type.startsWith('image/'),
            );
            pushFiles(list);
          }}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-6 text-sm transition-colors ${
            dragging
              ? 'border-accent bg-accent/5 text-accent-text'
              : 'border-nativz-border bg-surface text-text-secondary hover:border-accent/60 hover:text-text-primary'
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <UploadCloud size={18} className="text-text-muted" />
          <span>
            {files.length === 0
              ? 'Drop videos or images here, or click to pick'
              : `${files.length} file${files.length === 1 ? '' : 's'} selected — add more`}
          </span>
          <span className="text-xs text-text-muted">
            Up to {MAX_FILES} files. Videos and images can&rsquo;t be mixed in one calendar.
          </span>
        </button>

        {mediaSummary === 'mixed' && (
          <p className="text-xs text-rose-400">
            Mixed video and image files. Remove one type to continue.
          </p>
        )}
      </div>

      {files.length > 0 && (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-nativz-border bg-surface p-1.5">
          {files.map((f, idx) => {
            const p = progress.get(idx);
            const pct = p?.progress ?? 0;
            const state = p?.state ?? 'queued';
            return (
              <div
                key={`${f.name}-${idx}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-text-primary">{f.name}</span>
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {formatBytes(f.size)}
                    </span>
                  </div>
                  {(state === 'uploading' || state === 'done') && (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-nativz-border">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  {state === 'error' && (
                    <p className="mt-0.5 truncate text-[11px] text-rose-400">
                      {p?.error ?? 'Upload failed'}
                    </p>
                  )}
                </div>
                {!submitting && (
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                    className="text-text-muted transition-colors hover:text-text-primary"
                    aria-label="Remove file"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-text-secondary">
          Schedule window
        </label>
        <ScheduleRangePicker
          value={{ start: startDate, end: endDate }}
          onChange={(next) => {
            setStartDate(next.start);
            setEndDate(next.end);
          }}
          disabled={submitting}
        />
        <p className="text-xs text-text-muted">
          Posts go out at 12:00 PM Central every day in this window.
        </p>
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
