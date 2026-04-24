'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ClientOption = { id: string; name: string; slug: string };

export function NewProposalForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    client_id: '',
    signer_name: '',
    signer_email: '',
    signer_title: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/admin/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        client_id: form.client_id || null,
        signer_name: form.signer_name || null,
        signer_email: form.signer_email || null,
        signer_title: form.signer_title || null,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Could not create proposal');
      return;
    }
    router.push(`/admin/proposals/${json.slug}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-nativz-border bg-surface p-5">
      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Title</span>
        <input
          type="text"
          required
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Nativz growth retainer — Q3 2026"
          className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Client (optional)</span>
        <select
          value={form.client_id}
          onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
          className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
        >
          <option value="">— No client (prospect) —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Signer name</span>
          <input
            type="text"
            value={form.signer_name}
            onChange={(e) => setForm((f) => ({ ...f, signer_name: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Signer email</span>
          <input
            type="email"
            value={form.signer_email}
            onChange={(e) => setForm((f) => ({ ...f, signer_email: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Signer title (optional)</span>
          <input
            type="text"
            value={form.signer_title}
            onChange={(e) => setForm((f) => ({ ...f, signer_title: e.target.value }))}
            placeholder="e.g. CEO, Founder"
            className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
          />
        </label>
      </div>
      {error ? <p className="text-sm text-coral-300">{error}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-nz-cyan px-5 py-2 text-xs font-medium text-background hover:bg-nz-cyan/90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create draft'}
        </button>
      </div>
    </form>
  );
}
