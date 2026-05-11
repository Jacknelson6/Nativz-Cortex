'use client';

// SPY-04 T21: list active scorecard share links with view count + actions.
// Fetches GET /api/prospects/[id]/scorecard, supports archive + copy.

import { useCallback, useEffect, useState } from 'react';
import { Archive, Copy, ExternalLink, Eye, FileText, Loader2 } from 'lucide-react';
import type { ScorecardSnapshot } from '@/lib/prospects/checklist';

interface ShareLink {
  id: string;
  token: string;
  name: string | null;
  public_url: string;
  signed_pdf_url: string | null;
  expires_at: string | null;
  archived_at: string | null;
  created_at: string;
  view_count: number;
  scorecard_snapshot: ScorecardSnapshot;
}

interface Props {
  prospectId: string;
}

export function ScorecardShareLinkList({ prospectId }: Props) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/scorecard`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setLinks([]);
        return;
      }
      setLinks(json.links ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [prospectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function archive(token: string) {
    setArchiving(token);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/scorecard/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Archive failed (HTTP ${res.status})`);
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed');
    } finally {
      setArchiving(null);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // noop
    }
  }

  if (loading && links === null) {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-4 text-sm text-text-muted">
        <Loader2 size={14} className="mr-2 inline animate-spin" />
        Loading share links…
      </div>
    );
  }

  if (!links || links.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-4 text-sm text-text-muted">
        No share links yet. Generate one above.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <header className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-medium text-foreground">Share links</h3>
      </header>
      {error && (
        <div className="border-b border-red-500/30 bg-red-500/5 px-5 py-2 text-sm text-red-500">{error}</div>
      )}
      <ul className="divide-y divide-border">
        {links.map((link) => {
          const created = new Date(link.created_at).toLocaleDateString();
          const expires = link.expires_at ? new Date(link.expires_at).toLocaleDateString() : 'never';
          return (
            <li key={link.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {link.name ?? `Scorecard · ${created}`}
                </p>
                <p className="text-xs text-text-muted">
                  Created {created} · Expires {expires} · {link.scorecard_snapshot.summary.green} green,{' '}
                  {link.scorecard_snapshot.summary.yellow} yellow, {link.scorecard_snapshot.summary.red} red
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-text-muted">
                <Eye size={12} /> {link.view_count}
              </span>
              <button
                type="button"
                onClick={() => copy(link.public_url)}
                className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-surface"
              >
                <Copy size={12} /> Copy
              </button>
              <a
                href={link.public_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-surface"
              >
                <ExternalLink size={12} /> Open
              </a>
              {link.signed_pdf_url && (
                <a
                  href={link.signed_pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-surface"
                >
                  <FileText size={12} /> PDF
                </a>
              )}
              <button
                type="button"
                onClick={() => archive(link.token)}
                disabled={archiving === link.token}
                className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-text-muted hover:bg-surface hover:text-foreground disabled:opacity-50"
              >
                {archiving === link.token ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Archive size={12} />
                )}
                Archive
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
