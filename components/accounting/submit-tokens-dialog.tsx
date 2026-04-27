'use client';

import { useEffect, useState } from 'react';
import { Copy, Link as LinkIcon, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging';

interface TeamMember { id: string; full_name: string | null; role: string | null }

interface TokenRow {
  id: string;
  team_member: { id: string; full_name: string | null; role: string | null } | null;
  default_entry_type: EntryType | null;
  expires_at: string;
  last_used_at: string | null;
  use_count: number;
  url: string;
}

interface SubmitTokensDialogProps {
  open: boolean;
  onClose: () => void;
  periodId: string;
  periodLabel: string;
  teamMembers: TeamMember[];
}

/**
 * Per-period token directory. Admins mint one token per team member and
 * share the URL with them. The token scopes what the submitter can write
 * server-side — they can't re-use someone else's link.
 */
export function SubmitTokensDialog({
  open,
  onClose,
  periodId,
  periodLabel,
  teamMembers,
}: SubmitTokensDialogProps) {
  const [rows, setRows] = useState<TokenRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [mintingId, setMintingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/accounting/periods/${periodId}/submit-tokens`);
        const data = res.ok ? await res.json() : { tokens: [] };
        if (!cancelled) setRows(data.tokens ?? []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, periodId]);

  async function mint(memberId: string, defaultType?: EntryType) {
    setMintingId(memberId);
    try {
      const res = await fetch(`/api/accounting/periods/${periodId}/submit-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_member_id: memberId, default_entry_type: defaultType ?? 'editing' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to mint link');
        return;
      }
      // Refresh the table so the new row shows up.
      const refreshed = await fetch(`/api/accounting/periods/${periodId}/submit-tokens`);
      const refreshedData = await refreshed.json();
      setRows(refreshedData.tokens ?? []);
      toast.success('Link ready');
    } catch {
      toast.error('Failed to mint link');
    } finally {
      setMintingId(null);
    }
  }

  function copy(url: string) {
    navigator.clipboard.writeText(url);
    toast.success('Link copied');
  }

  const rowsByMemberId = new Map((rows ?? []).map((r) => [r.team_member?.id ?? '', r]));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title=""
      maxWidth="2xl"
      bodyClassName="p-0 flex flex-col max-h-[85vh]"
    >
        <div className="px-6 py-4 border-b border-nativz-border">
          <div className="flex items-center gap-2">
            <LinkIcon size={14} className="text-accent-text" />
            <p className="text-xs uppercase tracking-wide text-text-secondary font-medium">
              Submit links · {periodLabel}
            </p>
          </div>
          <h2 className="text-xl font-bold text-text-primary mt-1">Share a link per team member</h2>
          <p className="text-sm text-text-secondary mt-1">
            Each link lets that person paste and submit their own numbers. Expires in 21 days.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <table className="w-full text-base">
              <thead className="text-text-secondary">
                <tr className="border-b border-nativz-border">
                  <th className="text-left font-semibold px-3 py-2">Team member</th>
                  <th className="text-left font-semibold px-3 py-2">Link</th>
                  <th className="text-right font-semibold px-3 py-2">Submissions</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.map((m) => {
                  const existing = rowsByMemberId.get(m.id);
                  const busy = mintingId === m.id;
                  return (
                    <tr key={m.id} className="border-b border-nativz-border align-middle">
                      <td className="px-3 py-3">
                        <p className="text-text-primary font-medium">{m.full_name ?? 'Unnamed'}</p>
                        {m.role && <p className="text-xs text-text-secondary">{m.role}</p>}
                      </td>
                      <td className="px-3 py-3 min-w-[240px]">
                        {existing ? (
                          <div className="flex items-center gap-2">
                            <code className="flex-1 truncate rounded border border-nativz-border bg-background px-2 py-1 text-xs font-mono text-text-secondary">
                              {existing.url}
                            </code>
                            <Button variant="outline" size="sm" onClick={() => copy(existing.url)}>
                              <Copy size={12} /> Copy
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => mint(m.id, existing.default_entry_type ?? 'editing')}
                              disabled={busy}
                              title="Rotate — old link stops working"
                            >
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            </Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => mint(m.id, 'editing')} disabled={busy}>
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <LinkIcon size={12} />}
                            Generate link
                          </Button>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-text-secondary">
                        {existing?.use_count ?? 0}
                      </td>
                    </tr>
                  );
                })}
                {teamMembers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-base text-text-secondary">
                      No team members yet — add them under Users → Team.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
    </Dialog>
  );
}
