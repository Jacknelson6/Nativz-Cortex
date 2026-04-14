'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Loader2,
  Trash2,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Globe,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';

export interface AuditSummary {
  id: string;
  website_url: string | null;
  tiktok_url: string;
  status: string;
  created_at: string;
  scorecard: Record<string, unknown> | null;
}

interface AuditHistoryRailProps {
  audits: AuditSummary[];
  onAuditsChange: (audits: AuditSummary[]) => void;
}

function extractDomain(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Convert a website URL to a display label: the bare company name when we can
 * reasonably derive one, otherwise the hostname. `nike.com` → `Nike`,
 * `anderson-collaborative.com` → `Anderson collaborative`, a multi-segment
 * host like `shop.example.co.uk` falls back to `shop.example.co.uk` so we
 * don't pretend "Shop" is the brand.
 */
function formatCompanyLabel(url: string | null): string {
  const domain = extractDomain(url);
  if (!domain) return 'Unknown';
  // Single-label-before-TLD hosts (nike.com, foo-bar.co) get the label.
  // Anything deeper keeps the full host so we don't misrepresent subdomains.
  const parts = domain.split('.');
  if (parts.length > 2) return domain;
  const [first] = parts;
  if (!first) return domain;
  const cleaned = first.replace(/[-_]+/g, ' ').trim();
  if (!cleaned) return domain;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Google favicon service — same source the mention picker uses. */
function faviconUrl(url: string | null, size = 32): string | null {
  const domain = extractDomain(url);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

const menuItemClass = 'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary cursor-pointer outline-none transition-colors';
const menuSurfaceClass = 'min-w-[180px] rounded-xl border border-nativz-border bg-surface p-1 shadow-xl';

export function AuditHistoryRail({ audits, onAuditsChange }: AuditHistoryRailProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [faviconErrors, setFaviconErrors] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Keep a ref so the polling effect can read the latest list without
  // re-subscribing every time the parent passes a new audits array (which
  // would reset the interval and never actually tick).
  const auditsRef = useRef(audits);
  auditsRef.current = audits;
  const onAuditsChangeRef = useRef(onAuditsChange);
  onAuditsChangeRef.current = onAuditsChange;

  /**
   * Poll any audits that are still `pending` or `processing` so their
   * status icons don't get stuck on the spinner. The /api/analyze-social/[id]
   * endpoint has server-side stale detection that auto-fails audits older
   * than 7 minutes, so polling here also recovers abandoned/crashed jobs.
   * Polls every 5s while any in-flight audit exists; stops the interval
   * the moment everything is settled.
   */
  const hasInFlight = useMemo(
    () => audits.some((a) => a.status === 'pending' || a.status === 'processing'),
    [audits],
  );
  useEffect(() => {
    if (!hasInFlight) return;
    let cancelled = false;

    const tick = async () => {
      const inFlight = auditsRef.current.filter(
        (a) => a.status === 'pending' || a.status === 'processing',
      );
      if (inFlight.length === 0) return;
      const updates: Map<string, AuditSummary> = new Map();
      await Promise.all(
        inFlight.map(async (a) => {
          try {
            const res = await fetch(`/api/analyze-social/${a.id}`, { cache: 'no-store' });
            if (!res.ok) return;
            const data = (await res.json()) as { audit?: Partial<AuditSummary> & { scorecard?: Record<string, unknown> | null } };
            if (!data.audit) return;
            updates.set(a.id, {
              ...a,
              status: data.audit.status ?? a.status,
              scorecard: data.audit.scorecard ?? a.scorecard,
            });
          } catch {
            /* ignore transient poll errors */
          }
        }),
      );
      if (cancelled || updates.size === 0) return;
      const next = auditsRef.current.map((a) => updates.get(a.id) ?? a);
      // Only propagate if something actually changed — avoids re-render loops.
      const changed = next.some((n, i) => n !== auditsRef.current[i]);
      if (changed) onAuditsChangeRef.current(next);
    };

    // Tick immediately so the user sees fresh state on mount, then every 5s.
    void tick();
    const interval = setInterval(() => {
      void tick();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasInFlight]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return audits;
    const q = searchQuery.toLowerCase();
    return audits.filter(a =>
      extractDomain(a.website_url).toLowerCase().includes(q) ||
      a.tiktok_url?.toLowerCase().includes(q)
    );
  }, [audits, searchQuery]);

  function toggleSelect(id: string, e?: React.MouseEvent) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (e?.shiftKey && prev.size > 0) {
        const ids = filtered.map(a => a.id);
        const lastSelected = [...prev].pop()!;
        const startIdx = ids.indexOf(lastSelected);
        const endIdx = ids.indexOf(id);
        if (startIdx >= 0 && endIdx >= 0) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = from; i <= to; i++) next.add(ids[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(id: string) {
    // Optimistic: hide the row immediately, roll back if the API rejects.
    const prevAudits = audits;
    const prevSelected = new Set(selectedIds);
    onAuditsChange(audits.filter(a => a.id !== id));
    if (selectedIds.has(id)) {
      const next = new Set(selectedIds);
      next.delete(id);
      setSelectedIds(next);
    }
    try {
      const res = await fetch(`/api/analyze-social?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Audit deleted');
    } catch {
      // Rollback
      onAuditsChange(prevAudits);
      setSelectedIds(prevSelected);
      toast.error('Failed to delete');
    }
  }

  async function handleDeleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    // Optimistic: remove all selected immediately, rollback any that fail.
    const prevAudits = audits;
    onAuditsChange(audits.filter(a => !selectedIds.has(a.id)));
    setSelectedIds(new Set());
    const failures: string[] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/analyze-social?id=${id}`, { method: 'DELETE' });
          if (!res.ok) failures.push(id);
        } catch {
          failures.push(id);
        }
      }),
    );
    if (failures.length > 0) {
      // Restore failed rows
      onAuditsChange(prevAudits.filter(a => !ids.includes(a.id) || failures.includes(a.id)));
      toast.error(`${failures.length} audit${failures.length !== 1 ? 's' : ''} failed to delete`);
    } else {
      toast.success(`${ids.length} audit${ids.length !== 1 ? 's' : ''} deleted`);
    }
  }

  async function handleCopyLink(id: string) {
    // Mint (or retrieve) a public share token via the same endpoint AuditShareButton
    // uses, then copy the returned public URL to the clipboard.
    try {
      const res = await fetch(`/api/analyze-social/${id}/share`, { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { url?: string };
        if (data.url) {
          await navigator.clipboard.writeText(data.url);
          toast.success('Public share link copied');
          return;
        }
      }
    } catch {
      // fall through to internal link fallback
    }
    // Fallback: copy the internal (login-required) link
    const internalUrl = `${window.location.origin}/admin/analyze-social/${id}`;
    try {
      await navigator.clipboard.writeText(internalUrl);
    } catch {
      // clipboard may be unavailable in some contexts
    }
    toast.warning("Internal link copied — couldn't create public share");
  }

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — matches the Topic Search rail exactly: "History" label,
          optional bulk-delete affordance, search input below. */}
      <div className="shrink-0 space-y-2 border-b border-nativz-border/50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">History</span>
          {hasSelection && (
            <button
              onClick={handleDeleteSelected}
              className="flex cursor-pointer items-center gap-1 text-xs text-red-400 transition-colors hover:text-red-300"
            >
              <Trash2 size={12} /> Delete {selectedIds.size}
            </button>
          )}
        </div>
        <div className="relative w-full">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-nativz-border bg-background py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-text-muted">
            {audits.length === 0 ? 'No audits yet' : 'No results'}
          </div>
        )}
        {filtered.map((audit, index) => {
          const href = `/admin/analyze-social/${audit.id}`;
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);
          const isSelected = selectedIds.has(audit.id);
          const isDeleting = deletingIds.has(audit.id);
          const isProcessing = audit.status === 'processing' || audit.status === 'pending';
          const label = formatCompanyLabel(audit.website_url);
          const icon = faviconUrl(audit.website_url, 32);
          const showFavicon = icon && !faviconErrors.has(audit.id);

          const menuItems = (
            <>
              <DropdownMenuItem
                className={menuItemClass}
                onSelect={() => router.push(href)}
              >
                <ExternalLink size={14} /> Open
              </DropdownMenuItem>
              <DropdownMenuItem
                className={menuItemClass}
                onSelect={() => handleCopyLink(audit.id)}
              >
                <Link2 size={14} /> Copy link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={cn(menuItemClass, 'text-red-400 hover:text-red-300')}
                onSelect={(e) => {
                  e.preventDefault();
                  handleDelete(audit.id);
                }}
              >
                <Trash2 size={14} /> Delete
              </DropdownMenuItem>
            </>
          );

          return (
            <ContextMenu key={audit.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    'group flex w-full min-w-0 animate-stagger-in cursor-default items-center gap-1 rounded-lg border px-1.5 py-1 pr-1 transition-colors',
                    isActive
                      ? 'border-accent/10 bg-accent-surface/20'
                      : isSelected
                      ? 'border-accent/20 bg-accent-surface/10'
                      : 'border-transparent hover:bg-surface-hover',
                    isProcessing && 'opacity-70',
                    isDeleting && 'opacity-40',
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                  onClick={(e) => {
                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                      e.preventDefault();
                      toggleSelect(audit.id, e);
                    }
                  }}
                >
                  <Link
                    href={href}
                    className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
                  >
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-hover/60">
                      {showFavicon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={icon}
                          alt=""
                          className="h-4 w-4 object-contain"
                          onError={() =>
                            setFaviconErrors((prev) => new Set(prev).add(audit.id))
                          }
                        />
                      ) : (
                        <Globe size={11} className="text-text-muted/60" aria-hidden />
                      )}
                    </div>
                    <span
                      className={cn(
                        'truncate text-sm leading-snug transition-colors',
                        isActive
                          ? 'text-text-primary'
                          : 'text-text-secondary group-hover:text-text-primary',
                      )}
                      title={label}
                    >
                      {label}
                    </span>
                  </Link>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {isProcessing && (
                      <Loader2 size={13} className="animate-spin text-text-muted" />
                    )}
                    {audit.status === 'failed' && <Badge variant="danger">Failed</Badge>}
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="More actions"
                          title="More actions"
                          className="shrink-0 rounded-md p-1 text-text-muted opacity-100 transition-[opacity,background-color,color] duration-150 hover:bg-surface-hover hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 md:opacity-0 md:group-hover:opacity-100 md:data-[state=open]:opacity-100"
                        >
                          <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        sideOffset={4}
                        className={menuSurfaceClass}
                      >
                        {menuItems}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className={menuSurfaceClass}>
                <ContextMenuItem
                  className={menuItemClass}
                  onSelect={() => router.push(href)}
                >
                  <ExternalLink size={14} /> Open
                </ContextMenuItem>
                <ContextMenuItem
                  className={menuItemClass}
                  onSelect={() => handleCopyLink(audit.id)}
                >
                  <Link2 size={14} /> Copy link
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className={cn(menuItemClass, 'text-red-400 hover:text-red-300')}
                  onSelect={(e) => {
                    e.preventDefault();
                    handleDelete(audit.id);
                  }}
                >
                  <Trash2 size={14} /> Delete
                </ContextMenuItem>
                {hasSelection && selectedIds.size > 1 && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className={cn(menuItemClass, 'text-red-400 hover:text-red-300')}
                      onSelect={(e) => {
                        e.preventDefault();
                        handleDeleteSelected();
                      }}
                    >
                      <Trash2 size={14} /> Delete {selectedIds.size} selected
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
