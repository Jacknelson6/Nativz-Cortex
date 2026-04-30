'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ClientLogo } from '@/components/clients/client-logo';
import {
  EDITING_TYPE_LABEL,
  type EditingProjectType,
} from '@/lib/editing/types';

/**
 * Two-field create flow: pick a brand, name the project. Type defaults
 * to "Organic content" because that's the dominant flow; editors can
 * change it later from the detail panel. Name has no template, editors
 * call them whatever fits ("Q2 Reel batch 3", "Black Friday cutdowns").
 */

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
  onCreated: (id: string) => void;
}) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [name, setName] = useState('');
  const [type, setType] = useState<EditingProjectType>('organic_content');
  const [notes, setNotes] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    setClientId('');
    setName('');
    setType('organic_content');
    setNotes('');
    setDriveUrl('');
  }

  async function submit() {
    if (!clientId) return toast.error('Pick a brand first');
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
          drive_folder_url: driveUrl.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? 'Create failed');
      }
      const data = (await res.json()) as { id: string };
      reset();
      onCreated(data.id);
      toast.success('Project created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New editing project" maxWidth="lg">
      <div className="space-y-4">
        <ClientField
          clients={clients}
          value={clientId}
          onChange={setClientId}
        />

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

        <Field
          label="Drive folder URL"
          helper="Optional. Paste the source folder so editors can fall back to Drive if they need to."
        >
          <input
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            placeholder="https://drive.google.com/..."
            className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_3px_var(--focus-ring)]"
          />
        </Field>

        <Field label="Notes" helper="Optional brief, references, or hand-off context.">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Lean into the founder voice. 6 cuts total. Keep under 28s each."
            className="block w-full resize-none rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_3px_var(--focus-ring)]"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create project'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-text-secondary">{label}</label>
      {children}
      {helper && <p className="text-[11px] text-text-muted">{helper}</p>}
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
  const selected = clients.find((c) => c.id === value);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-text-secondary">Brand</label>
      {selected ? (
        <button
          type="button"
          onClick={() => onChange('')}
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
        <div className="max-h-56 overflow-y-auto rounded-lg border border-nativz-border bg-surface">
          {clients.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-text-muted">
              <Building2 size={14} />
              <span>Loading brands...</span>
            </div>
          ) : (
            <ul>
              {clients.map((c) => (
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
      )}
    </div>
  );
}
