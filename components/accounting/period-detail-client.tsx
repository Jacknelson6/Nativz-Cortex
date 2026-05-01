'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Check,
  Download,
  ChevronRight,
  Sparkles,
  Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SubNav, type SubNavItem } from '@/components/ui/sub-nav';
import { centsToDollars } from '@/lib/accounting/periods';
import { ImportDialog } from './import-dialog';
import { SubmitTokensDialog } from './submit-tokens-dialog';
import { ComptrollerShareDialog } from './comptroller-share-dialog';
import { EntriesGrid, type GridEntry } from './entries-grid';
import { PayoutsPane } from './payouts-pane';

// DB still accepts 'override' and 'misc' (schema unchanged). They're
// just not exposed as tabs in the UI per product call.
type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging';
type TabKey = 'overview' | 'payouts' | EntryType;

interface TeamMember { id: string; full_name: string | null; role: string | null }
interface Client {
  id: string;
  name: string;
  services?: string[] | null;
  editing_rate_per_video_cents?: number | null;
}

interface PeriodDetailClientProps {
  period: {
    id: string;
    start_date: string;
    end_date: string;
    half: 'first-half' | 'second-half';
    status: 'draft' | 'locked' | 'paid';
    notes: string | null;
    locked_at: string | null;
    paid_at: string | null;
    label: string;
  };
  initialEntries: GridEntry[];
  teamMembers: TeamMember[];
  clients: Client[];
}

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  editing: 'Editing',
  smm: 'SMM',
  affiliate: 'Affiliate',
  blogging: 'Blogging',
};

const SERVICE_TAB_LABELS: Record<TabKey, string> = {
  overview: 'Overview',
  payouts: 'Payouts',
  editing: 'Editing',
  smm: 'SMM',
  affiliate: 'Affiliate',
  blogging: 'Blogging',
};
const SERVICE_TAB_ORDER: TabKey[] = ['overview', 'payouts', 'editing', 'smm', 'affiliate', 'blogging'];

export function PeriodDetailClient({
  period,
  initialEntries,
  teamMembers,
  clients,
}: PeriodDetailClientProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<GridEntry[]>(initialEntries);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [importOpen, setImportOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [comptrollerOpen, setComptrollerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const readonly = period.status !== 'draft';

  const grandTotal = useMemo(
    () => entries.reduce((sum, e) => sum + (e.amount_cents ?? 0), 0),
    [entries],
  );
  const totalMargin = useMemo(
    () => entries.reduce((sum, e) => sum + (e.margin_cents ?? 0), 0),
    [entries],
  );

  const entriesByService = useMemo(() => {
    const out: Record<EntryType, GridEntry[]> = {
      editing: [], smm: [], affiliate: [], blogging: [],
    };
    for (const e of entries) {
      if (e.entry_type in out) out[e.entry_type as EntryType].push(e);
    }
    return out;
  }, [entries]);

  const payoutPayeeCount = useMemo(() => {
    const keys = new Set<string>();
    for (const e of entries) {
      if (e.team_member_id) {
        keys.add(`m:${e.team_member_id}`);
      } else {
        const label = (e.payee_label ?? '').trim().toLowerCase();
        if (label) keys.add(`l:${label}`);
      }
    }
    return keys.size;
  }, [entries]);

  const serviceTabItems = useMemo<SubNavItem<TabKey>[]>(
    () => SERVICE_TAB_ORDER.map((slug) => {
      let count: number;
      if (slug === 'overview') count = entries.length;
      else if (slug === 'payouts') count = payoutPayeeCount;
      else count = entriesByService[slug].length;
      return {
        slug,
        label: SERVICE_TAB_LABELS[slug],
        count: count > 0 ? count : null,
      };
    }),
    [entries.length, entriesByService, payoutPayeeCount],
  );

  async function handleStatus(status: 'locked' | 'paid' | 'draft') {
    const res = await fetch(`/api/accounting/periods/${period.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error('Failed to update status');
      return;
    }
    toast.success(`Period ${status}`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">{period.label}</h1>
          <p className="text-base text-text-secondary mt-2">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} ·{' '}
            <span className="text-text-primary font-semibold tabular-nums">{centsToDollars(grandTotal)}</span> payouts ·{' '}
            <span className="text-text-primary tabular-nums">{centsToDollars(totalMargin)}</span> margin
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {!readonly && (
            <>
              <Button variant="outline" size="sm" onClick={() => setLinksOpen(true)}>
                <LinkIcon size={14} /> Submit links
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Sparkles size={14} /> Import
              </Button>
            </>
          )}
          {entries.length > 0 && (
            <a
              href={`/api/accounting/periods/${period.id}/export?format=quickbooks`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-hover whitespace-nowrap"
              title="QuickBooks-friendly Bill format"
            >
              <Download size={14} /> Export QuickBooks CSV
            </a>
          )}
          {period.status === 'draft' && (
            <Button variant="outline" size="sm" onClick={() => handleStatus('locked')} disabled={isPending}>
              <Lock size={14} /> Lock
            </Button>
          )}
          {period.status === 'locked' && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleStatus('draft')} disabled={isPending}>
                Unlock
              </Button>
              <Button size="sm" onClick={() => handleStatus('paid')} disabled={isPending}>
                <Check size={14} /> Mark paid
              </Button>
            </>
          )}
          {period.status === 'paid' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
              <Check size={12} /> Paid
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setComptrollerOpen(true)}>
            <LinkIcon size={14} /> Share read-only
          </Button>
        </div>
      </div>

      <SubNav
        items={serviceTabItems}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="Service entries"
      />

      {activeTab === 'overview' ? (
        <OverviewPane
          entries={entries}
          entriesByService={entriesByService}
          onDrillIn={setActiveTab}
        />
      ) : activeTab === 'payouts' ? (
        <PayoutsPane
          periodId={period.id}
          periodLabel={period.label}
          entries={entries}
          clients={clients}
        />
      ) : (
        <EntriesGrid
          key={activeTab}
          service={activeTab}
          entries={entriesByService[activeTab]}
          teamMembers={teamMembers}
          clients={clients}
          readonly={readonly}
          periodId={period.id}
          onLocalCreate={(e) => setEntries((prev) => [...prev, e])}
          onLocalUpdate={(e) =>
            setEntries((prev) => prev.map((x) => (x.id === e.id ? e : x)))
          }
          onLocalDelete={(id) =>
            setEntries((prev) => prev.filter((x) => x.id !== id))
          }
        />
      )}

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        periodId={period.id}
        periodLabel={period.label}
        teamMembers={teamMembers}
        clients={clients}
        onImported={() => router.refresh()}
      />

      <SubmitTokensDialog
        open={linksOpen}
        onClose={() => setLinksOpen(false)}
        periodId={period.id}
        periodLabel={period.label}
        teamMembers={teamMembers}
      />

      <ComptrollerShareDialog
        open={comptrollerOpen}
        onClose={() => setComptrollerOpen(false)}
        periodId={period.id}
        periodLabel={period.label}
      />
    </div>
  );
}

function OverviewPane({
  entries,
  entriesByService,
  onDrillIn,
}: {
  entries: GridEntry[];
  entriesByService: Record<EntryType, GridEntry[]>;
  onDrillIn: (t: EntryType) => void;
}) {
  const services: EntryType[] = ['editing', 'smm', 'affiliate', 'blogging'];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {services.map((s) => {
          const rows = entriesByService[s];
          const total = rows.reduce((sum, e) => sum + e.amount_cents, 0);
          const margin = rows.reduce((sum, e) => sum + (e.margin_cents ?? 0), 0);
          const videos = rows.reduce((sum, e) => sum + (e.video_count ?? 0), 0);
          return (
            <button
              key={s}
              type="button"
              onClick={() => onDrillIn(s)}
              className="group flex items-start justify-between rounded-2xl border border-nativz-border bg-surface px-6 py-5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <div>
                <p className="text-sm uppercase tracking-wide text-text-secondary font-semibold">
                  {ENTRY_TYPE_LABELS[s]}
                </p>
                <p className="text-3xl font-bold text-text-primary tabular-nums mt-2">
                  {centsToDollars(total)}
                </p>
                <p className="text-base text-text-secondary mt-1.5">
                  {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                  {videos > 0 && ` · ${videos} videos`}
                  {s === 'editing' && margin !== 0 && (
                    <>
                      {' · '}
                      <span className={margin < 0 ? 'text-red-400' : 'text-emerald-400'}>
                        {centsToDollars(margin)} margin
                      </span>
                    </>
                  )}
                </p>
              </div>
              <ChevronRight size={18} className="text-text-secondary group-hover:text-text-primary mt-1 shrink-0" />
            </button>
          );
        })}
      </div>
      {entries.length === 0 && (
        <div className="rounded-2xl border border-dashed border-nativz-border bg-surface px-4 py-12 text-center text-base text-text-secondary">
          No entries yet. Pick a service tab above to add entries.
        </div>
      )}
    </div>
  );
}
