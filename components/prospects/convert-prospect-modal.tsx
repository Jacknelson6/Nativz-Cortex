// SPY-07 T09: Convert-to-client modal. Triggered from the prospect detail
// header; collects org name, contact, tier, strategist, optional notes; POSTs
// /api/prospects/[id]/convert; on success copies invite_url and routes to the
// new client. 409 surfaces a merge-into-existing-org dialog.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

interface TierOption {
  slug: string;
  label: string;
}

interface StrategistOption {
  id: string;
  name: string;
}

interface ConvertProspectModalProps {
  open: boolean;
  onClose: () => void;
  prospectId: string;
  prospectBrandName: string;
  ownerUserId: string | null;
  tiers: TierOption[];
  strategists: StrategistOption[];
}

interface FormState {
  org_name: string;
  contact_email: string;
  contact_name: string;
  tier: string;
  strategist_user_id: string;
  notes: string;
}

export function ConvertProspectModal({
  open,
  onClose,
  prospectId,
  prospectBrandName,
  ownerUserId,
  tiers,
  strategists,
}: ConvertProspectModalProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    org_name: prospectBrandName,
    contact_email: '',
    contact_name: '',
    tier: tiers[0]?.slug ?? '',
    strategist_user_id: ownerUserId ?? strategists[0]?.id ?? '',
    notes: '',
  });
  const [mergeOrgId, setMergeOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm((prev) => ({ ...prev, org_name: prospectBrandName }));
  }, [open, prospectBrandName]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(overrideMergeOrgId?: string) {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        org_name: form.org_name.trim(),
        contact_email: form.contact_email.trim(),
        contact_name: form.contact_name.trim(),
        tier: form.tier,
        strategist_user_id: form.strategist_user_id,
      };
      if (form.notes.trim()) body.notes = form.notes.trim();
      if (overrideMergeOrgId) body.merge_into_org_id = overrideMergeOrgId;

      const res = await fetch(`/api/prospects/${prospectId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        if (data?.merge_candidates?.length) {
          setMergeOrgId(data.merge_candidates[0].id);
          toast.message('Org name collision — pick merge or rename', {
            description: 'An organization with this name already exists.',
          });
          return;
        }
        toast.error(data?.error ?? 'Already converted');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? 'Conversion failed');
        return;
      }

      const data = (await res.json()) as {
        client_id: string;
        invite_url: string;
      };

      try {
        await navigator.clipboard.writeText(data.invite_url);
        toast.success('Converted — invite URL copied to clipboard');
      } catch {
        toast.success('Converted', { description: data.invite_url });
      }

      router.push(`/admin/clients/${data.client_id}`);
      router.refresh();
      onClose();
    } catch (err) {
      console.error('Convert prospect failed', err);
      toast.error('Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    submit(mergeOrgId ?? undefined);
  }

  const valid =
    form.org_name.trim().length >= 2 &&
    form.contact_email.includes('@') &&
    form.contact_name.trim().length >= 2 &&
    form.tier &&
    form.strategist_user_id;

  return (
    <Dialog open={open} onClose={onClose} title="Convert to client" maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Organization name" required>
          <input
            type="text"
            value={form.org_name}
            onChange={(e) => update('org_name', e.target.value)}
            className={inputCls}
            placeholder="Acme Co"
            required
            minLength={2}
            maxLength={120}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact name" required>
            <input
              type="text"
              value={form.contact_name}
              onChange={(e) => update('contact_name', e.target.value)}
              className={inputCls}
              placeholder="Jane Doe"
              required
              minLength={2}
              maxLength={120}
            />
          </Field>
          <Field label="Contact email" required>
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => update('contact_email', e.target.value)}
              className={inputCls}
              placeholder="jane@acme.com"
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tier" required>
            <select
              value={form.tier}
              onChange={(e) => update('tier', e.target.value)}
              className={inputCls}
              required
            >
              {tiers.length === 0 && <option value="">No tiers configured</option>}
              {tiers.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Strategist" required>
            <select
              value={form.strategist_user_id}
              onChange={(e) => update('strategist_user_id', e.target.value)}
              className={inputCls}
              required
            >
              {strategists.length === 0 && <option value="">No strategists found</option>}
              {strategists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Notes" hint="Optional handoff context for the strategist.">
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className={`${inputCls} min-h-[80px] resize-y`}
            placeholder="Anything the strategist should know on day one"
            maxLength={2000}
          />
        </Field>

        {mergeOrgId && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            An organization with this name already exists. Submitting again will
            merge this client into the existing org. Rename the org above to mint
            a fresh one instead.
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {mergeOrgId ? 'Convert + merge org' : 'Convert to client'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const inputCls =
  'w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30';

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-text-secondary">
        {label}
        {required && <span className="ml-0.5 text-amber-400">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-text-muted">{hint}</span>}
    </label>
  );
}
