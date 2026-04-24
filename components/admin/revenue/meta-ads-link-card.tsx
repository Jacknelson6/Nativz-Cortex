'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Link2 } from 'lucide-react';

export function MetaAdsLinkCard({
  clientId,
  currentAccountId,
  lastSyncedAt,
}: {
  clientId: string;
  currentAccountId: string | null;
  lastSyncedAt: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentAccountId ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save(syncNow: boolean) {
    setBusy(true);
    setStatus(null);
    const res = await fetch(`/api/revenue/clients/${clientId}/meta-ad-account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        meta_ad_account_id: value.trim() || null,
        sync_now: syncNow,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(`Error: ${json.error ?? 'unknown'}`);
      return;
    }
    if (json.sync) {
      setStatus(
        json.sync.ok
          ? `Synced: ${json.sync.rows} rows across ${json.sync.months} months.`
          : `Linked, but sync failed: ${json.sync.error}`,
      );
    } else {
      setStatus('Saved.');
    }
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5">
      <header className="flex items-center gap-2">
        <Link2 size={14} className="text-text-muted" />
        <h2 className="text-sm font-semibold text-text-primary">Meta ads account</h2>
      </header>
      <p className="mt-1 text-[11px] text-text-muted">
        Paste the client&apos;s Meta ad-account id (the number after <code>act_</code>). Agency-partner
        access to the account must already be granted in Business Manager.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[200px]">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
            Ad account id
          </span>
          <input
            type="text"
            placeholder="1234567890 or act_1234567890"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary font-mono"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => save(false)}
          className="rounded-full border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={() => save(true)}
          className="inline-flex items-center gap-1 rounded-full bg-nz-cyan px-3 py-1.5 text-xs font-medium text-background hover:bg-nz-cyan/90 disabled:opacity-50"
        >
          <RefreshCcw size={11} /> Save + sync now
        </button>
      </div>

      <p className="mt-3 text-[11px] text-text-muted">
        {lastSyncedAt
          ? `Last synced ${new Date(lastSyncedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
          : 'Never synced.'}
      </p>
      {status ? <p className="mt-2 text-[11px] text-text-primary">{status}</p> : null}
    </section>
  );
}
