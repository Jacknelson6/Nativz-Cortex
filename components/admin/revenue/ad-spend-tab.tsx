'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatCents, dollarsToCents } from '@/lib/format/money';

type Platform = 'meta' | 'google' | 'tiktok' | 'youtube' | 'other';

type Entry = {
  id: string;
  client_id: string;
  platform: Platform;
  campaign_label: string | null;
  period_month: string;
  spend_cents: number;
  source: string;
  updated_at: string;
  clients: { name: string | null; slug: string | null } | null;
};

type ClientOption = { id: string; name: string; slug: string };

export function AdSpendTab({ clients }: { clients: ClientOption[] }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_id: clients[0]?.id ?? '',
    platform: 'meta' as Platform,
    campaign_label: '',
    period_month: firstOfThisMonth(),
    spend_dollars: '',
    notes: '',
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/revenue/ad-spend?limit=200');
      const json = await res.json();
      setEntries(json.entries ?? []);
    } catch (err) {
      console.error('[ad-spend-tab] refresh failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id || !form.spend_dollars) return;
    setSaving(true);
    try {
      const res = await fetch('/api/revenue/ad-spend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: form.client_id,
          platform: form.platform,
          campaign_label: form.campaign_label || null,
          period_month: form.period_month,
          spend_cents: dollarsToCents(form.spend_dollars),
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        alert('Save failed — check console');
        console.error(await res.text());
        return;
      }
      setShowForm(false);
      setForm((f) => ({ ...f, spend_dollars: '', campaign_label: '', notes: '' }));
      await refresh();
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this ad spend entry?')) return;
    const res = await fetch('/api/revenue/ad-spend', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return alert('Delete failed');
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Manual ad-spend ledger per client / platform / month. A future task wires Meta/Google auto-sync.
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-xs text-text-primary hover:bg-white/5"
        >
          <Plus size={12} /> Add entry
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={submit}
          className="grid grid-cols-1 gap-3 rounded-xl border border-nativz-border bg-surface p-4 sm:grid-cols-6"
        >
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Client</span>
            <select
              value={form.client_id}
              onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
              className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Platform</span>
            <select
              value={form.platform}
              onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as Platform }))}
              className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="meta">Meta</option>
              <option value="google">Google</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Month</span>
            <input
              type="date"
              value={form.period_month}
              onChange={(e) => setForm((f) => ({ ...f, period_month: e.target.value }))}
              className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Spend ($)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.spend_dollars}
              onChange={(e) => setForm((f) => ({ ...f, spend_dollars: e.target.value }))}
              className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Campaign</span>
            <input
              type="text"
              placeholder="e.g. Fall promo"
              value={form.campaign_label}
              onChange={(e) => setForm((f) => ({ ...f, campaign_label: e.target.value }))}
              className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <div className="sm:col-span-6 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-nz-cyan px-4 py-1.5 text-xs font-medium text-background hover:bg-nz-cyan/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save entry'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Platform</th>
              <th className="px-4 py-2.5 font-medium">Campaign</th>
              <th className="px-4 py-2.5 font-medium">Month</th>
              <th className="px-4 py-2.5 font-medium text-right">Spend</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-xs text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-xs text-text-muted">
                  No ad-spend entries yet. Add one above.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-text-primary">{e.clients?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-text-secondary capitalize">{e.platform}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{e.campaign_label ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-text-secondary">{e.period_month}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                    {formatCents(e.spend_cents)}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-text-muted">{e.source}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => remove(e.id)}
                      className="text-text-muted hover:text-coral-300"
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function firstOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
