'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  ExternalLink,
  Link2,
  AlertCircle,
  MoreHorizontal,
} from 'lucide-react';
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

const STATUS_ICON = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

const STATUS_COLOR = {
  pending: 'text-text-muted',
  processing: 'text-accent-text',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
};

function extractDomain(url: string | null): string {
  if (!url) return 'Unknown';
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

const menuItemClass = 'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary cursor-pointer outline-none transition-colors';
const menuSurfaceClass = 'min-w-[180px] rounded-xl border border-nativz-border bg-surface p-1 shadow-xl';

export function AuditHistoryRail({ audits, onAuditsChange }: AuditHistoryRailProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

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
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      await fetch(`/api/analyze-social?id=${id}`, { method: 'DELETE' });
      onAuditsChange(audits.filter(a => a.id !== id));
      selectedIds.delete(id);
      setSelectedIds(new Set(selectedIds));
      toast.success('Audit deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function handleDeleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    for (const id of ids) {
      setDeletingIds(prev => new Set(prev).add(id));
      try { await fetch(`/api/analyze-social?id=${id}`, { method: 'DELETE' }); } catch { /* continue */ }
    }
    onAuditsChange(audits.filter(a => !selectedIds.has(a.id)));
    setSelectedIds(new Set());
    setDeletingIds(new Set());
    toast.success(`${ids.length} audit${ids.length !== 1 ? 's' : ''} deleted`);
  }

  function handleCopyLink(id: string) {
    const url = `${window.location.origin}/admin/analyze-social/${id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied');
  }

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-nativz-border p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-text-primary">History</h2>
          {hasSelection && (
            <button onClick={handleDeleteSelected} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer">
              <Trash2 size={12} /> Delete {selectedIds.size}
            </button>
          )}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..."
            className="w-full rounded-lg border border-nativz-border bg-background py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/50" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-text-muted">
            {audits.length === 0 ? 'No audits yet' : 'No results'}
          </div>
        )}
        {filtered.map((audit, index) => {
          const Icon = STATUS_ICON[audit.status as keyof typeof STATUS_ICON] ?? AlertCircle;
          const color = STATUS_COLOR[audit.status as keyof typeof STATUS_COLOR] ?? 'text-text-muted';
          const domain = extractDomain(audit.website_url);
          const score = (audit.scorecard as Record<string, unknown>)?.overallScore;
          const isSelected = selectedIds.has(audit.id);
          const isDeleting = deletingIds.has(audit.id);
          const isActive = typeof window !== 'undefined' && window.location.pathname.includes(audit.id);

          return (
            <ContextMenu key={audit.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    'group flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 mx-1 my-0.5 transition-colors cursor-default animate-stagger-in',
                    isActive ? 'border-accent/10 bg-accent-surface/20' : isSelected ? 'border-accent/20 bg-accent-surface/10' : 'border-transparent hover:bg-surface-hover',
                    isDeleting && 'opacity-40',
                  )}
                  style={{ animationDelay: `${index * 30}ms`, width: 'calc(100% - 0.5rem)' }}
                  onClick={(e) => {
                    if (e.shiftKey || e.metaKey || e.ctrlKey) { e.preventDefault(); toggleSelect(audit.id, e); }
                    else router.push(`/admin/analyze-social/${audit.id}`);
                  }}
                >
                  <Icon size={14} className={cn('shrink-0', color, audit.status === 'processing' && 'animate-spin')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary truncate leading-tight">{domain}</p>
                    <p className="text-xs text-text-muted/60 leading-tight">
                      {new Date(audit.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      {typeof score === 'number' && ` · ${score}/100`}
                    </p>
                  </div>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded-md p-1 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-hover hover:text-text-primary">
                        <MoreHorizontal size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4} className={menuSurfaceClass}>
                      <DropdownMenuItem className={menuItemClass} onSelect={() => router.push(`/admin/analyze-social/${audit.id}`)}><ExternalLink size={14} /> Open</DropdownMenuItem>
                      <DropdownMenuItem className={menuItemClass} onSelect={() => handleCopyLink(audit.id)}><Link2 size={14} /> Copy link</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className={cn(menuItemClass, 'text-red-400 hover:text-red-300')} onSelect={() => handleDelete(audit.id)}><Trash2 size={14} /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className={menuSurfaceClass}>
                <ContextMenuItem className={menuItemClass} onSelect={() => router.push(`/admin/analyze-social/${audit.id}`)}><ExternalLink size={14} /> Open</ContextMenuItem>
                <ContextMenuItem className={menuItemClass} onSelect={() => handleCopyLink(audit.id)}><Link2 size={14} /> Copy link</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem className={cn(menuItemClass, 'text-red-400 hover:text-red-300')} onSelect={() => handleDelete(audit.id)}><Trash2 size={14} /> Delete</ContextMenuItem>
                {hasSelection && selectedIds.size > 1 && (
                  <><ContextMenuSeparator /><ContextMenuItem className={cn(menuItemClass, 'text-red-400 hover:text-red-300')} onSelect={handleDeleteSelected}><Trash2 size={14} /> Delete {selectedIds.size} selected</ContextMenuItem></>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
