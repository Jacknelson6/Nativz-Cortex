'use client';

import { useState } from 'react';
import { Loader2, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { TemplateRow, TierPreview } from './page';

interface Props {
  templates: TemplateRow[];
}

export function TemplatesEditor({ templates: initial }: Props) {
  const [templates, setTemplates] = useState(initial);

  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center">
        <p className="text-sm text-text-muted">No active templates yet.</p>
      </div>
    );
  }

  function patchTier(templateId: string, tierId: string, patch: Partial<TierPreview>) {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id !== templateId
          ? t
          : { ...t, tiers: t.tiers.map((tier) => (tier.id === tierId ? { ...tier, ...patch } : tier)) },
      ),
    );
  }

  return (
    <div className="space-y-8">
      {templates.map((template) => (
        <TemplateCard key={template.id} template={template} onTierPatch={patchTier} />
      ))}
    </div>
  );
}

function TemplateCard({
  template,
  onTierPatch,
}: {
  template: TemplateRow;
  onTierPatch: (templateId: string, tierId: string, patch: Partial<TierPreview>) => void;
}) {
  const offerUrl = `/offer/${template.source_folder}`;
  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted">
            {template.agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz'}
          </p>
          <h2 className="text-lg font-semibold text-text-primary">{template.name}</h2>
        </div>
        <a
          href={offerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline"
        >
          <ExternalLink size={12} />
          {offerUrl}
        </a>
      </header>

      <div className="space-y-3">
        {template.tiers.map((tier) => (
          <TierRow
            key={tier.id}
            templateId={template.id}
            tier={tier}
            onPatch={(patch) => onTierPatch(template.id, tier.id, patch)}
          />
        ))}
      </div>
    </section>
  );
}

function TierRow({
  templateId,
  tier,
  onPatch,
}: {
  templateId: string;
  tier: TierPreview;
  onPatch: (patch: Partial<TierPreview>) => void;
}) {
  const [draft, setDraft] = useState(tier.stripe_payment_link ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dollars = ((tier.monthly_cents ?? tier.total_cents ?? 0) / 100).toLocaleString();
  const cadence = tier.cadence ?? 'month';
  const priceLabel = `$${dollars}${tier.subscription || tier.cadence ? ` / ${cadence}` : ''}`;

  async function save() {
    const trimmed = draft.trim();
    const original = tier.stripe_payment_link ?? '';
    if (trimmed === original) return;

    if (trimmed && !/^https:\/\/buy\.stripe\.com\//i.test(trimmed) && !/^https:\/\/checkout\.stripe\.com\//i.test(trimmed)) {
      toast.error('Stripe payment links start with https://buy.stripe.com/ or https://checkout.stripe.com/');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/proposals/templates/${templateId}/payment-links`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier_id: tier.id, stripe_payment_link: trimmed || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? `Save failed (${res.status})`);
        return;
      }
      onPatch({ stripe_payment_link: trimmed || null });
      setSavedAt(Date.now());
      toast.success(`${tier.name} link saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  const isSet = !!tier.stripe_payment_link;

  return (
    <div className="rounded-md border border-nativz-border bg-background p-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-primary">{tier.name}</p>
          <p className="text-xs text-text-muted">{priceLabel}</p>
        </div>
        {isSet ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <Check size={10} /> Linked
          </span>
        ) : (
          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-300">Missing</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          placeholder="https://buy.stripe.com/…"
          className="flex-1 rounded-md border border-nativz-border bg-surface px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
          disabled={saving}
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || draft.trim() === (tier.stripe_payment_link ?? '')}
          className="rounded-md bg-accent-text px-3 py-2 text-xs font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
        </button>
      </div>
      {savedAt ? <p className="text-[10px] text-text-muted">Saved · {new Date(savedAt).toLocaleTimeString()}</p> : null}
    </div>
  );
}
