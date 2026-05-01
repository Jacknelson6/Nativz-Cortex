'use client';

import { useMemo, useState } from 'react';
import {
  Sparkles,
  Loader2,
  Check,
  Trash2,
  CheckCircle2,
  Link as LinkIcon,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { centsToDollars } from '@/lib/accounting/periods';
import { isLikelyWiseUrl } from '@/lib/accounting/wise';

type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging';

interface ProposedEntry {
  entry_type: EntryType;
  client_id: string | null;
  client_name_raw: string | null;
  video_count: number;
  rate_cents: number;
  amount_cents: number;
  description: string | null;
}

interface SubmitPayrollClientProps {
  token: string;
  periodLabel: string;
  memberName: string;
  defaultType: EntryType;
  clients: Array<{ id: string; name: string }>;
  previousSubmissionCount: number;
}

type Stage = 'form' | 'paste' | 'submitting' | 'done';

interface RowDraft {
  id: string;
  video_count: number;
  rate_cents: number;
  amount_cents: number;
  description: string;
}

interface ClientCard {
  id: string;
  client_id: string | null;
  rows: RowDraft[];
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function emptyRow(): RowDraft {
  return { id: newId(), video_count: 0, rate_cents: 0, amount_cents: 0, description: '' };
}

function emptyCard(): ClientCard {
  return { id: newId(), client_id: null, rows: [emptyRow()] };
}

function hasPerUnitPricing(type: EntryType): boolean {
  return type === 'editing';
}

function rowSubtotal(row: RowDraft, type: EntryType): number {
  if (hasPerUnitPricing(type)) {
    return row.video_count * row.rate_cents;
  }
  return row.amount_cents;
}

function cardTotal(card: ClientCard, type: EntryType): number {
  return card.rows.reduce((sum, r) => sum + rowSubtotal(r, type), 0);
}

/**
 * Public submission page for a team member. No login required, the URL token
 * is the credential. Default UX is a Notion-style direct entry form grouped
 * by client; an "Or paste" escape hatch routes to the AI parser and folds
 * the proposals back into the same grouped form. Server locks the payee
 * (team_member_id), period_id, and entry_type to whatever the token was
 * minted with.
 */
export function SubmitPayrollClient({
  token,
  periodLabel,
  memberName,
  defaultType,
  clients,
  previousSubmissionCount,
}: SubmitPayrollClientProps) {
  const [stage, setStage] = useState<Stage>('form');
  const [cards, setCards] = useState<ClientCard[]>(() => [emptyCard()]);
  const [pasteText, setPasteText] = useState('');
  const [wiseUrl, setWiseUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [created, setCreated] = useState(0);
  const [createdTotal, setCreatedTotal] = useState(0);

  const wiseUrlTrimmed = wiseUrl.trim();
  const wiseUrlValid =
    wiseUrlTrimmed === '' || /^https?:\/\/\S+$/i.test(wiseUrlTrimmed);
  const wiseUrlLooksWise = wiseUrlTrimmed === '' || isLikelyWiseUrl(wiseUrlTrimmed);

  const perUnit = hasPerUnitPricing(defaultType);

  const grandTotal = useMemo(
    () => cards.reduce((sum, c) => sum + cardTotal(c, defaultType), 0),
    [cards, defaultType],
  );

  const submittableEntryCount = useMemo(
    () =>
      cards.reduce(
        (sum, c) => sum + c.rows.filter((r) => rowSubtotal(r, defaultType) > 0).length,
        0,
      ),
    [cards, defaultType],
  );

  function patchCard(cardId: string, patch: Partial<ClientCard>) {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, ...patch } : c)));
  }
  function addCard() {
    setCards((prev) => [...prev, emptyCard()]);
  }
  function removeCard(cardId: string) {
    setCards((prev) => (prev.length === 1 ? [emptyCard()] : prev.filter((c) => c.id !== cardId)));
  }
  function patchRow(cardId: string, rowId: string, patch: Partial<RowDraft>) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        return {
          ...c,
          rows: c.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
        };
      }),
    );
  }
  function addRow(cardId: string) {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, rows: [...c.rows, emptyRow()] } : c)),
    );
  }
  function removeRow(cardId: string, rowId: string) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        if (c.rows.length === 1) return { ...c, rows: [emptyRow()] };
        return { ...c, rows: c.rows.filter((r) => r.id !== rowId) };
      }),
    );
  }

  async function handleParse() {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const res = await fetch(`/api/submit-payroll/${token}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Parse failed');
        return;
      }
      const proposals: ProposedEntry[] = data.proposals ?? [];
      if (proposals.length === 0) {
        toast.error('Nothing detected. Try rewriting or adding dollar amounts.');
        return;
      }
      const byClient = new Map<string, ClientCard>();
      for (const p of proposals) {
        const key = p.client_id ?? '__null__';
        if (!byClient.has(key)) {
          byClient.set(key, { id: newId(), client_id: p.client_id, rows: [] });
        }
        byClient.get(key)!.rows.push({
          id: newId(),
          video_count: p.video_count,
          rate_cents: p.rate_cents,
          amount_cents: p.amount_cents,
          description: p.description ?? '',
        });
      }
      setCards(Array.from(byClient.values()));
      setStage('form');
      setPasteText('');
      toast.success(
        `Loaded ${proposals.length} ${proposals.length === 1 ? 'entry' : 'entries'} from your paste.`,
      );
    } catch {
      toast.error('Parse failed, try again.');
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit() {
    if (!wiseUrlValid) {
      toast.error('Wise link must start with http:// or https://');
      return;
    }
    const entries = cards.flatMap((c) =>
      c.rows
        .map((r) => {
          const amt = rowSubtotal(r, defaultType);
          if (amt <= 0) return null;
          return {
            entry_type: defaultType,
            client_id: c.client_id,
            video_count: perUnit ? r.video_count : 0,
            rate_cents: perUnit ? r.rate_cents : 0,
            amount_cents: amt,
            description: r.description.trim() || null,
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null),
    );
    if (entries.length === 0) {
      toast.error('Nothing to submit yet, add some quantities.');
      return;
    }
    setStage('submitting');
    try {
      const res = await fetch(`/api/submit-payroll/${token}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries,
          wise_url: wiseUrlTrimmed || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Submit failed');
        setStage('form');
        return;
      }
      setCreated(data.created ?? entries.length);
      setCreatedTotal(data.total_cents ?? grandTotal);
      setStage('done');
    } catch {
      toast.error('Submit failed');
      setStage('form');
    }
  }

  if (stage === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 size={48} className="text-emerald-400 mx-auto" />
          <h1 className="text-3xl font-bold text-text-primary">Submitted</h1>
          <p className="text-base text-text-secondary">
            {created} {created === 1 ? 'entry' : 'entries'} logged for {periodLabel},{' '}
            <span className="text-text-primary font-semibold">{centsToDollars(createdTotal)}</span>.
          </p>
          <p className="text-sm text-text-secondary">
            Jack will review and lock the period before payout.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setStage('form');
              setCards([emptyCard()]);
              setPasteText('');
            }}
          >
            Submit more
          </Button>
        </div>
      </div>
    );
  }

  if (stage === 'paste') {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-secondary font-medium">
              Payroll submission · {periodLabel}
            </p>
            <h1 className="text-3xl font-bold text-text-primary mt-2">Paste your notes</h1>
            <p className="text-base text-text-secondary mt-2">
              Drop a list of what you did and we&apos;ll parse it into the form for you to review.
              Any format works.
            </p>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`Toastique: 12 videos @ $35
Videolab: 8 videos @ $35
Rockpower: 3 revisions @ $25`}
            rows={14}
            className="w-full rounded-xl border border-nativz-border bg-surface px-4 py-3 text-base text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent font-mono"
          />
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStage('form')}>
              ← Back to form
            </Button>
            <Button onClick={handleParse} disabled={parsing || !pasteText.trim()}>
              {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Parse and load
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary font-medium">
            Payroll submission · {periodLabel}
          </p>
          <h1 className="text-3xl font-bold text-text-primary mt-2">
            Hey {memberName}, log your work.
          </h1>
          <p className="text-base text-text-secondary mt-2">
            Group your entries by client, fill in your numbers, add your Wise link, hit submit.
          </p>
          {previousSubmissionCount > 0 && (
            <p className="text-sm text-text-secondary mt-2">
              You&apos;ve submitted {previousSubmissionCount}{' '}
              {previousSubmissionCount === 1 ? 'time' : 'times'} before for this period. New
              entries get appended.
            </p>
          )}
        </div>

        <WiseUrlField
          value={wiseUrl}
          onChange={setWiseUrl}
          valid={wiseUrlValid}
          looksWise={wiseUrlLooksWise}
        />

        <div className="space-y-4">
          {cards.map((card) => {
            const subtotal = cardTotal(card, defaultType);
            const usedClientIds = new Set(
              cards
                .filter((c) => c.id !== card.id && c.client_id)
                .map((c) => c.client_id as string),
            );
            const availableClients = clients.filter(
              (c) => !usedClientIds.has(c.id) || c.id === card.client_id,
            );
            return (
              <ClientCardView
                key={card.id}
                card={card}
                subtotal={subtotal}
                perUnit={perUnit}
                clients={availableClients}
                canRemove={cards.length > 1}
                onClientChange={(client_id) => patchCard(card.id, { client_id })}
                onRemove={() => removeCard(card.id)}
                onPatchRow={(rowId, patch) => patchRow(card.id, rowId, patch)}
                onAddRow={() => addRow(card.id)}
                onRemoveRow={(rowId) => removeRow(card.id, rowId)}
              />
            );
          })}

          <button
            onClick={addCard}
            className="w-full rounded-xl border border-dashed border-nativz-border bg-transparent px-5 py-4 text-sm text-text-secondary hover:text-accent hover:border-accent transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus size={16} />
            Add another client
          </button>

          <div className="flex items-center justify-center pt-2">
            <button
              onClick={() => setStage('paste')}
              className="text-xs text-text-secondary hover:text-accent cursor-pointer underline-offset-2 hover:underline inline-flex items-center gap-1.5"
            >
              <Sparkles size={12} />
              Or paste from your notes and we&apos;ll parse it for you
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 border-t border-nativz-border bg-surface/95 backdrop-blur z-40">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="text-xs uppercase tracking-wide text-text-secondary font-medium">
              Total
            </span>
            <span className="text-2xl font-bold tabular-nums text-text-primary">
              {centsToDollars(grandTotal)}
            </span>
            <span className="text-xs text-text-secondary">
              {submittableEntryCount} {submittableEntryCount === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={
              stage === 'submitting' || submittableEntryCount === 0 || !wiseUrlValid
            }
            size="lg"
          >
            {stage === 'submitting' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            Submit my entries
          </Button>
        </div>
      </div>
    </div>
  );
}

function ClientCardView({
  card,
  subtotal,
  perUnit,
  clients,
  canRemove,
  onClientChange,
  onRemove,
  onPatchRow,
  onAddRow,
  onRemoveRow,
}: {
  card: ClientCard;
  subtotal: number;
  perUnit: boolean;
  clients: Array<{ id: string; name: string }>;
  canRemove: boolean;
  onClientChange: (client_id: string | null) => void;
  onRemove: () => void;
  onPatchRow: (rowId: string, patch: Partial<RowDraft>) => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-nativz-border">
        <div className="flex-1 min-w-0">
          <select
            value={card.client_id ?? ''}
            onChange={(e) => onClientChange(e.target.value || null)}
            className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-base font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">— pick a client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-text-secondary hover:text-red-400 cursor-pointer p-1 shrink-0"
            title="Remove this client"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="px-5 py-3">
        <div
          className={`grid ${
            perUnit
              ? 'grid-cols-[110px_120px_110px_1fr_32px]'
              : 'grid-cols-[1fr_140px_32px]'
          } gap-3 text-xs uppercase tracking-wide text-text-secondary font-medium pb-2`}
        >
          {perUnit ? (
            <>
              <span>Quantity</span>
              <span>$ each</span>
              <span>Total</span>
              <span>Notes</span>
              <span />
            </>
          ) : (
            <>
              <span>Notes</span>
              <span>Total</span>
              <span />
            </>
          )}
        </div>

        <div className="divide-y divide-nativz-border/60">
          {card.rows.map((row) => (
            <div
              key={row.id}
              className={`grid ${
                perUnit
                  ? 'grid-cols-[110px_120px_110px_1fr_32px]'
                  : 'grid-cols-[1fr_140px_32px]'
              } gap-3 py-3 items-center`}
            >
              {perUnit ? (
                <>
                  <input
                    type="number"
                    min="0"
                    value={row.video_count || ''}
                    onChange={(e) =>
                      onPatchRow(row.id, {
                        video_count: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    placeholder="0"
                    className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-base tabular-nums text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.rate_cents ? (row.rate_cents / 100).toFixed(2) : ''}
                    onChange={(e) =>
                      onPatchRow(row.id, {
                        rate_cents: Math.round((parseFloat(e.target.value) || 0) * 100),
                      })
                    }
                    placeholder="0.00"
                    className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-base tabular-nums text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <div className="px-3 py-2 text-base tabular-nums font-semibold text-text-primary">
                    {centsToDollars(row.video_count * row.rate_cents)}
                  </div>
                  <input
                    type="text"
                    value={row.description}
                    onChange={(e) => onPatchRow(row.id, { description: e.target.value })}
                    placeholder="Optional notes"
                    className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-base text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    onClick={() => onRemoveRow(row.id)}
                    className="text-text-secondary hover:text-red-400 cursor-pointer flex items-center justify-center"
                    title="Remove row"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={row.description}
                    onChange={(e) => onPatchRow(row.id, { description: e.target.value })}
                    placeholder="What did you do?"
                    className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-base text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.amount_cents ? (row.amount_cents / 100).toFixed(2) : ''}
                    onChange={(e) =>
                      onPatchRow(row.id, {
                        amount_cents: Math.round((parseFloat(e.target.value) || 0) * 100),
                      })
                    }
                    placeholder="0.00"
                    className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-base tabular-nums text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    onClick={() => onRemoveRow(row.id)}
                    className="text-text-secondary hover:text-red-400 cursor-pointer flex items-center justify-center"
                    title="Remove row"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={onAddRow}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent cursor-pointer"
        >
          <Plus size={14} />
          Add another row
        </button>
      </div>

      <div className="px-5 py-3 border-t border-nativz-border bg-background/30 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-text-secondary font-medium">
          Subtotal
        </span>
        <span className="text-base font-bold tabular-nums text-text-primary">
          {centsToDollars(subtotal)}
        </span>
      </div>
    </div>
  );
}

function WiseUrlField({
  value,
  onChange,
  valid,
  looksWise,
}: {
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
  looksWise: boolean;
}) {
  const trimmed = value.trim();
  const showInvalid = trimmed !== '' && !valid;
  const showWiseHint = trimmed !== '' && valid && !looksWise;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface px-4 py-3 space-y-1.5">
      <label
        htmlFor="wise-url"
        className="flex items-center gap-1.5 text-sm font-medium text-text-primary"
      >
        <LinkIcon size={14} className="text-text-secondary" />
        Your Wise payment link
      </label>
      <input
        id="wise-url"
        type="url"
        inputMode="url"
        autoComplete="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://wise.com/pay/..."
        className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 ${
          showInvalid
            ? 'border-red-400/60 focus:border-red-400 focus:ring-red-400'
            : 'border-nativz-border focus:border-accent focus:ring-accent'
        }`}
      />
      {showInvalid ? (
        <p className="text-xs text-red-400">
          Needs to start with http:// or https://
        </p>
      ) : showWiseHint ? (
        <p className="text-xs text-text-secondary">
          Doesn&apos;t look like a Wise link. We&apos;ll save it anyway, but double-check the URL.
        </p>
      ) : (
        <p className="text-xs text-text-secondary">
          Optional. We&apos;ll attach it to each entry so Jack can pay you without asking.
        </p>
      )}
    </div>
  );
}
