'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Eye, Link2, Loader2, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * "Share for review" button that lives in the editing project detail
 * header. Mints a public review link (POST /share), shows the freshly
 * minted URL with a copy button, and lists prior links + view counts so
 * the editor can see whether a client has actually opened the page.
 *
 * Mirrors the social calendar share flow but the public surface is
 * `/c/edit/<token>` (no captions, just the cuts).
 */

interface ShareLink {
  id: string;
  url: string;
  created_at: string;
  expires_at: string;
  last_viewed_at: string | null;
  revoked: boolean;
  view_count: number;
  views: { viewed_at: string; viewer_name: string | null }[];
}

export function EditingShareButton({
  projectId,
  hasVideos,
}: {
  projectId: string;
  hasVideos: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [justCopiedId, setJustCopiedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Failed to load share links');
      const body = (await res.json()) as { links: ShareLink[] };
      setLinks(body.links);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open, projectId]);

  async function mintAndCopy() {
    if (!hasVideos) {
      toast.error('Upload at least one edited cut before sharing.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share`,
        { method: 'POST' },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? 'Failed to mint link');
      const url = body.url as string;
      await copy(url);
      toast.success('Review link copied to clipboard');
      setJustCopiedId(body.link.id);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mint link');
    } finally {
      setCreating(false);
    }
  }

  async function copy(url: string, linkId?: string) {
    try {
      await navigator.clipboard.writeText(url);
      if (linkId) {
        setJustCopiedId(linkId);
        setTimeout(
          () => setJustCopiedId((id) => (id === linkId ? null : id)),
          1500,
        );
      }
    } catch {
      toast.error('Could not copy. Long-press the URL to copy manually.');
    }
  }

  async function revoke(linkId: string) {
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/share?linkId=${linkId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Failed to revoke');
      toast.success('Link revoked');
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Share for review">
          <Share2 size={14} />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-96 p-0"
      >
        <div className="border-b border-nativz-border p-3">
          <p className="text-sm font-medium text-text-primary">
            Share for review
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            Anyone with the link can watch the cuts. No login required.
          </p>
          <Button
            size="sm"
            className="mt-3 w-full"
            onClick={() => void mintAndCopy()}
            disabled={creating || !hasVideos}
          >
            {creating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Minting link...
              </>
            ) : (
              <>
                <Link2 size={14} />
                Create + copy link
              </>
            )}
          </Button>
          {!hasVideos ? (
            <p className="mt-2 text-xs text-text-muted">
              Upload at least one edited cut to enable sharing.
            </p>
          ) : null}
        </div>

        <div className="max-h-72 overflow-y-auto p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            Active links
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={14} className="animate-spin text-text-muted" />
            </div>
          ) : links.length === 0 ? (
            <p className="py-2 text-xs text-text-muted">No links yet.</p>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="rounded-lg border border-nativz-border bg-surface p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">
                      {link.url}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copy(link.url, link.id)}
                      className="flex shrink-0 items-center gap-1 rounded-md border border-nativz-border px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary"
                    >
                      {justCopiedId === link.id ? (
                        <>
                          <Check size={11} />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Eye size={11} />
                      {link.view_count}{' '}
                      {link.view_count === 1 ? 'view' : 'views'}
                      {link.last_viewed_at ? (
                        <>
                          {' · last '}
                          {timeAgo(link.last_viewed_at)}
                        </>
                      ) : (
                        ' · not opened yet'
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => void revoke(link.id)}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-text-muted transition-colors hover:bg-status-danger/10 hover:text-status-danger"
                    >
                      <Trash2 size={11} />
                      Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
