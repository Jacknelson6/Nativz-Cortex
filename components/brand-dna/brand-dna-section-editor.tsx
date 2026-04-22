'use client';

import { useState, useRef } from 'react';
import { Plus, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type {
  BrandColor, BrandFont, BrandLogo, ProductItem, ProductOfferingType,
  BrandGuidelineMetadata,
} from '@/lib/knowledge/types';
import { dispatchBrandDnaUpdated } from '@/lib/brand-dna/brand-dna-updated-event';

interface BrandDNASectionEditorProps {
  section: string;
  clientId: string;
  metadata: BrandGuidelineMetadata;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Partial<BrandGuidelineMetadata>) => void;
}

export function BrandDNASectionEditor({
  section,
  clientId,
  metadata,
  open,
  onClose,
  onSaved,
}: BrandDNASectionEditorProps) {
  const sectionTitle = sectionLabel(section);

  return (
    <Dialog open={open} onClose={onClose} title={`Edit ${sectionTitle}`} maxWidth="lg">
      <SectionForm
        section={section}
        clientId={clientId}
        metadata={metadata}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Routes each section to its form
// ---------------------------------------------------------------------------

function SectionForm({
  section,
  clientId,
  metadata,
  onClose,
  onSaved,
}: {
  section: string;
  clientId: string;
  metadata: BrandGuidelineMetadata;
  onClose: () => void;
  onSaved: (updated: Partial<BrandGuidelineMetadata>) => void;
}) {
  switch (section) {
    case 'Colors':
      return <ColorsForm clientId={clientId} colors={metadata.colors ?? []} onClose={onClose} onSaved={onSaved} />;
    case 'Typography':
      return <TypographyForm clientId={clientId} fonts={metadata.fonts ?? []} onClose={onClose} onSaved={onSaved} />;
    case 'Logo':
      return <LogoForm clientId={clientId} logos={metadata.logos ?? []} onClose={onClose} onSaved={onSaved} />;
    case 'Verbal identity':
      return (
        <VerbalForm
          clientId={clientId}
          tonePrimary={metadata.tone_primary ?? ''}
          voiceAttributes={metadata.voice_attributes ?? []}
          messagingPillars={metadata.messaging_pillars ?? []}
          vocabularyPatterns={metadata.vocabulary_patterns ?? []}
          avoidancePatterns={metadata.avoidance_patterns ?? []}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case 'Target audience':
      return (
        <TextareaForm
          clientId={clientId}
          label="Target audience summary"
          fieldKey="target_audience_summary"
          value={metadata.target_audience_summary ?? ''}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case 'Competitive positioning':
      return (
        <TextareaForm
          clientId={clientId}
          label="Competitive positioning"
          fieldKey="competitive_positioning"
          value={metadata.competitive_positioning ?? ''}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case 'Product catalog':
      return <ProductsForm clientId={clientId} products={metadata.products ?? []} onClose={onClose} onSaved={onSaved} />;
    case 'Content framing rules':
      return (
        <FramingRulesForm
          clientId={clientId}
          rules={metadata.content_framing_rules ?? {}}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case 'CTAs and quotes':
      return (
        <CtasAndQuotesForm
          clientId={clientId}
          approvedCtas={metadata.approved_ctas ?? []}
          bannedCtas={metadata.banned_ctas ?? []}
          approvedQuoteBank={metadata.approved_quote_bank ?? []}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case 'Claim hygiene':
      return (
        <GuardrailsForm
          clientId={clientId}
          claimHygiene={metadata.claim_hygiene_rules ?? {}}
          videoRules={metadata.short_form_video_rules ?? {}}
          castingTone={metadata.casting_and_tone ?? {}}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    default:
      return <p className="text-sm text-text-muted">No editor available for this section.</p>;
  }
}

// ---------------------------------------------------------------------------
// Shared save helper
// ---------------------------------------------------------------------------

async function saveBrandDNA(
  clientId: string,
  patch: Partial<BrandGuidelineMetadata>,
): Promise<boolean> {
  const res = await fetch(`/api/clients/${clientId}/brand-dna`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata: patch }),
  });
  if (res.ok) {
    dispatchBrandDnaUpdated(clientId);
  }
  return res.ok;
}

// ---------------------------------------------------------------------------
// Colors form
// ---------------------------------------------------------------------------

const COLOR_ROLES = ['primary', 'secondary', 'accent', 'tertiary', 'neutral'] as const;

function ColorsForm({
  clientId,
  colors: initial,
  onClose,
  onSaved,
}: {
  clientId: string;
  colors: BrandColor[];
  onClose: () => void;
  onSaved: (u: Partial<BrandGuidelineMetadata>) => void;
}) {
  const [colors, setColors] = useState<BrandColor[]>(initial.length > 0 ? initial : []);
  const [saving, setSaving] = useState(false);
  const newColorRef = useRef<HTMLButtonElement>(null);

  function addColor() {
    setColors((prev) => [
      ...prev,
      { hex: '#3b82f6', name: '', role: 'secondary' },
    ]);
  }

  function remove(i: number) {
    setColors((prev) => prev.filter((_, idx) => idx !== i));
  }

  function update(i: number, field: keyof BrandColor, value: string) {
    setColors((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function handleSave() {
    setSaving(true);
    const ok = await saveBrandDNA(clientId, { colors });
    setSaving(false);
    if (ok) {
      toast.success('Colors saved');
      onSaved({ colors });
      onClose();
    } else {
      toast.error('Failed to save');
    }
  }

  const rowGrid =
    'md:grid md:grid-cols-[2.75rem_6.5rem_minmax(0,1fr)_7.5rem_2.5rem] md:gap-x-3 md:items-center md:gap-y-0';

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 [scrollbar-width:thin]">
        <div
          className="hidden md:grid md:grid-cols-[2.75rem_6.5rem_minmax(0,1fr)_7.5rem_2.5rem] md:gap-x-3 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted/90"
          aria-hidden
        >
          <span />
          <span>Hex</span>
          <span>Name</span>
          <span>Role</span>
          <span className="text-center" />
        </div>
        {colors.map((color, i) => (
          <div
            key={i}
            className={`rounded-xl border border-nativz-border bg-surface/50 p-3 space-y-2.5 ${rowGrid}`}
          >
            <div className="flex items-center gap-3 md:contents">
              <div className="relative shrink-0 justify-self-start">
                <div
                  className="h-10 w-10 rounded-lg border border-nativz-border shadow-inner cursor-pointer md:h-9 md:w-9"
                  style={{ backgroundColor: color.hex }}
                />
                <input
                  type="color"
                  value={color.hex}
                  onChange={(e) => update(i, 'hex', e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0 w-full h-full rounded-lg"
                  aria-label={`Pick color ${i + 1}`}
                />
              </div>
              <input
                type="text"
                value={color.hex}
                onChange={(e) => update(i, 'hex', e.target.value)}
                placeholder="#3b82f6"
                className="flex-1 min-w-0 rounded-lg border border-nativz-border bg-background px-2.5 py-2 text-xs font-mono text-text-primary tabular-nums outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 md:w-full md:flex-none"
              />
            </div>
            <input
              type="text"
              value={color.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              placeholder="Color name"
              className="w-full min-w-0 rounded-lg border border-nativz-border bg-background px-2.5 py-2 text-sm text-text-primary outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 md:min-w-0"
            />
            <div className="flex items-center gap-2 md:contents">
              <select
                value={color.role}
                onChange={(e) => update(i, 'role', e.target.value)}
                className="min-h-[2.25rem] flex-1 rounded-lg border border-nativz-border bg-background px-2.5 py-2 text-xs capitalize text-text-primary outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 md:w-full md:min-w-0"
              >
                {COLOR_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => remove(i)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-text-muted transition-colors hover:border-red-500/25 hover:bg-red-500/10 hover:text-red-400 md:mx-auto"
                aria-label={`Remove color ${i + 1}`}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addColor}
        ref={newColorRef}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-accent-text transition-colors cursor-pointer py-1"
      >
        <Plus size={14} /> Add color
      </button>

      <SaveRow saving={saving} onCancel={onClose} onSave={handleSave} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typography form
// ---------------------------------------------------------------------------

const FONT_ROLES = ['display', 'body', 'mono'] as const;

function TypographyForm({
  clientId,
  fonts: initial,
  onClose,
  onSaved,
}: {
  clientId: string;
  fonts: BrandFont[];
  onClose: () => void;
  onSaved: (u: Partial<BrandGuidelineMetadata>) => void;
}) {
  const [fonts, setFonts] = useState<BrandFont[]>(initial);
  const [saving, setSaving] = useState(false);

  function addFont() {
    setFonts((prev) => [...prev, { family: '', role: 'body' }]);
  }

  function remove(i: number) {
    setFonts((prev) => prev.filter((_, idx) => idx !== i));
  }

  function update(i: number, field: keyof BrandFont, value: string) {
    setFonts((prev) => prev.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)));
  }

  async function handleSave() {
    setSaving(true);
    const ok = await saveBrandDNA(clientId, { fonts });
    setSaving(false);
    if (ok) {
      toast.success('Typography saved');
      onSaved({ fonts });
      onClose();
    } else {
      toast.error('Failed to save');
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {fonts.map((font, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-nativz-border bg-background px-3 py-2">
            <input
              type="text"
              value={font.family}
              onChange={(e) => update(i, 'family', e.target.value)}
              placeholder="Font family (e.g. Inter)"
              className="flex-1 rounded bg-transparent text-sm text-text-primary border-none outline-none focus:ring-1 focus:ring-accent/50 px-1 py-0.5"
            />
            <input
              type="text"
              value={font.weight ?? ''}
              onChange={(e) => update(i, 'weight', e.target.value)}
              placeholder="Weight"
              className="w-20 rounded bg-transparent text-xs text-text-muted border-none outline-none focus:ring-1 focus:ring-accent/50 px-1 py-0.5"
            />
            <select
              value={font.role}
              onChange={(e) => update(i, 'role', e.target.value)}
              className="text-xs text-text-muted bg-background rounded border border-nativz-border px-1.5 py-0.5 outline-none focus:border-accent/50"
            >
              {FONT_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 text-text-muted hover:text-red-400 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addFont}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-accent-text transition-colors cursor-pointer py-1"
      >
        <Plus size={14} /> Add font
      </button>

      <SaveRow saving={saving} onCancel={onClose} onSave={handleSave} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logo form
// ---------------------------------------------------------------------------

const LOGO_VARIANTS = ['primary', 'dark', 'light', 'icon'] as const;

function LogoForm({
  clientId,
  logos: initial,
  onClose,
  onSaved,
}: {
  clientId: string;
  logos: BrandLogo[];
  onClose: () => void;
  onSaved: (u: Partial<BrandGuidelineMetadata>) => void;
}) {
  const [logos, setLogos] = useState<BrandLogo[]>(initial);
  const [saving, setSaving] = useState(false);

  function addLogo() {
    setLogos((prev) => [...prev, { url: '', variant: 'primary' }]);
  }

  function remove(i: number) {
    setLogos((prev) => prev.filter((_, idx) => idx !== i));
  }

  function update(i: number, field: keyof BrandLogo, value: string) {
    setLogos((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }

  async function handleSave() {
    const filtered = logos.filter((l) => l.url.trim());
    setSaving(true);
    const ok = await saveBrandDNA(clientId, { logos: filtered });
    setSaving(false);
    if (ok) {
      toast.success('Logos saved');
      onSaved({ logos: filtered });
      onClose();
    } else {
      toast.error('Failed to save');
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {logos.map((logo, i) => (
          <div key={i} className="rounded-lg border border-nativz-border bg-background p-3 space-y-2">
            <div className="flex items-center gap-3">
              {logo.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo.url}
                  alt="logo preview"
                  className="h-10 w-10 rounded object-contain border border-nativz-border bg-white/5 shrink-0"
                />
              )}
              <input
                type="text"
                value={logo.url}
                onChange={(e) => update(i, 'url', e.target.value)}
                placeholder="Logo URL"
                className="flex-1 rounded bg-transparent text-sm text-text-primary border-b border-nativz-border outline-none focus:border-accent/50 px-1 py-0.5"
              />
              <select
                value={logo.variant}
                onChange={(e) => update(i, 'variant', e.target.value)}
                className="text-xs text-text-muted bg-background rounded border border-nativz-border px-1.5 py-0.5 outline-none focus:border-accent/50"
              >
                {LOGO_VARIANTS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 text-text-muted hover:text-red-400 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addLogo}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-accent-text transition-colors cursor-pointer py-1"
      >
        <Plus size={14} /> Add logo URL
      </button>

      <SaveRow saving={saving} onCancel={onClose} onSave={handleSave} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verbal identity form (tone + voice + messaging pillars)
// ---------------------------------------------------------------------------

function VerbalForm({
  clientId,
  tonePrimary: initialTone,
  voiceAttributes: initialAttrs,
  messagingPillars: initialPillars,
  vocabularyPatterns: initialVocab,
  avoidancePatterns: initialAvoid,
  onClose,
  onSaved,
}: {
  clientId: string;
  tonePrimary: string;
  voiceAttributes: string[];
  messagingPillars: string[];
  vocabularyPatterns: string[];
  avoidancePatterns: string[];
  onClose: () => void;
  onSaved: (u: Partial<BrandGuidelineMetadata>) => void;
}) {
  const [tone, setTone] = useState(initialTone);
  const [attrs, setAttrs] = useState<string[]>(initialAttrs);
  const [pillars, setPillars] = useState<string[]>(initialPillars);
  const [vocab, setVocab] = useState<string[]>(initialVocab);
  const [avoid, setAvoid] = useState<string[]>(initialAvoid);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const patch: Partial<BrandGuidelineMetadata> = {
      tone_primary: tone,
      voice_attributes: attrs.filter(Boolean),
      messaging_pillars: pillars.filter(Boolean),
      vocabulary_patterns: vocab.filter(Boolean),
      avoidance_patterns: avoid.filter(Boolean),
    };
    setSaving(true);
    const ok = await saveBrandDNA(clientId, patch);
    setSaving(false);
    if (ok) {
      toast.success('Verbal identity saved');
      onSaved(patch);
      onClose();
    } else {
      toast.error('Failed to save');
    }
  }

  return (
    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
      {/* Tone primary */}
      <div>
        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
          Primary tone
        </label>
        <input
          type="text"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="e.g. Professional, Approachable, Bold"
          className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-colors"
        />
      </div>

      <TagListEditor
        label="Voice attributes"
        tags={attrs}
        onChange={setAttrs}
        placeholder="Add attribute (e.g. Witty)"
      />

      <TagListEditor
        label="Messaging pillars"
        tags={pillars}
        onChange={setPillars}
        placeholder="Add pillar (e.g. Quality craftsmanship)"
      />

      <TagListEditor
        label="Vocabulary to use"
        tags={vocab}
        onChange={setVocab}
        placeholder="Add term"
      />

      <TagListEditor
        label="Vocabulary to avoid"
        tags={avoid}
        onChange={setAvoid}
        placeholder="Add term to avoid"
      />

      <SaveRow saving={saving} onCancel={onClose} onSave={handleSave} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Products form
// ---------------------------------------------------------------------------

/** Not shown in the picker — legacy rows normalize to `other` on save */
const OFFERING_TYPES_EXCLUDED_FROM_UI: ProductOfferingType[] = [
  'affiliate_program',
  'ambassador_program',
  'partnership',
];

const OFFERING_TYPE_OPTIONS: { value: ProductOfferingType | ''; label: string }[] = [
  { value: '', label: 'Offering type' },
  { value: 'product', label: 'Product' },
  { value: 'service', label: 'Service' },
  { value: 'other', label: 'Other' },
];

function selectValueForOfferingType(ot?: ProductOfferingType): string {
  if (!ot) return '';
  if (OFFERING_TYPES_EXCLUDED_FROM_UI.includes(ot)) return '';
  return ot;
}

function ProductsForm({
  clientId,
  products: initial,
  onClose,
  onSaved,
}: {
  clientId: string;
  products: ProductItem[];
  onClose: () => void;
  onSaved: (u: Partial<BrandGuidelineMetadata>) => void;
}) {
  const [products, setProducts] = useState<ProductItem[]>(initial);
  const [saving, setSaving] = useState(false);

  function addProduct() {
    setProducts((prev) => [...prev, { name: '', description: '' }]);
  }

  function remove(i: number) {
    setProducts((prev) => prev.filter((_, idx) => idx !== i));
  }

  function update(i: number, field: keyof ProductItem, value: string) {
    setProducts((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        if (field === 'offeringType') {
          return {
            ...p,
            offeringType: value === '' ? undefined : (value as ProductOfferingType),
          };
        }
        return { ...p, [field]: value };
      }),
    );
  }

  async function handleSave() {
    const filtered = products
      .filter((p) => p.name.trim())
      .map((p) => ({
        ...p,
        offeringType:
          p.offeringType && OFFERING_TYPES_EXCLUDED_FROM_UI.includes(p.offeringType)
            ? 'other'
            : p.offeringType,
      }));
    setSaving(true);
    const ok = await saveBrandDNA(clientId, { products: filtered });
    setSaving(false);
    if (ok) {
      toast.success('Products saved');
      onSaved({ products: filtered });
      onClose();
    } else {
      toast.error('Failed to save');
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {products.map((product, i) => (
          <div key={i} className="rounded-lg border border-nativz-border bg-background p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={product.name}
                  onChange={(e) => update(i, 'name', e.target.value)}
                  placeholder="Product name"
                  className="w-full rounded bg-transparent text-sm font-medium text-text-primary border-b border-nativz-border outline-none focus:border-accent/50 px-1 py-0.5"
                />
                <input
                  type="text"
                  value={product.description}
                  onChange={(e) => update(i, 'description', e.target.value)}
                  placeholder="Brief description"
                  className="w-full rounded bg-transparent text-xs text-text-muted border-b border-nativz-border/50 outline-none focus:border-accent/50 px-1 py-0.5"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={product.price ?? ''}
                    onChange={(e) => update(i, 'price', e.target.value)}
                    placeholder="Price"
                    className="w-28 rounded bg-transparent text-xs text-text-muted border-b border-nativz-border/50 outline-none focus:border-accent/50 px-1 py-0.5"
                  />
                  <input
                    type="text"
                    value={product.category ?? ''}
                    onChange={(e) => update(i, 'category', e.target.value)}
                    placeholder="Category"
                    className="flex-1 rounded bg-transparent text-xs text-text-muted border-b border-nativz-border/50 outline-none focus:border-accent/50 px-1 py-0.5"
                  />
                </div>
                <select
                  value={selectValueForOfferingType(product.offeringType)}
                  onChange={(e) => update(i, 'offeringType', e.target.value)}
                  className="w-full rounded bg-background text-xs text-text-muted border border-nativz-border px-1.5 py-1 outline-none focus:border-accent/50"
                >
                  {OFFERING_TYPE_OPTIONS.map((o) => (
                    <option key={o.value || 'placeholder'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  type="url"
                  value={product.imageUrl ?? ''}
                  onChange={(e) => update(i, 'imageUrl', e.target.value)}
                  placeholder="Image URL (optional)"
                  className="w-full rounded bg-transparent text-xs text-text-muted border-b border-nativz-border/50 outline-none focus:border-accent/50 px-1 py-0.5"
                />
                <input
                  type="text"
                  value={product.cta ?? ''}
                  onChange={(e) => update(i, 'cta', e.target.value)}
                  placeholder="CTA on ad (optional, e.g. Shop now)"
                  maxLength={100}
                  className="w-full rounded bg-transparent text-xs text-text-muted border-b border-nativz-border/50 outline-none focus:border-accent/50 px-1 py-0.5"
                />
                <input
                  type="text"
                  value={product.offer ?? ''}
                  onChange={(e) => update(i, 'offer', e.target.value)}
                  placeholder="Offer for this product (optional, e.g. 20% off today)"
                  maxLength={300}
                  className="w-full rounded bg-transparent text-xs text-text-muted border-b border-nativz-border/50 outline-none focus:border-accent/50 px-1 py-0.5"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="mt-0.5 text-text-muted hover:text-red-400 transition-colors cursor-pointer shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addProduct}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-accent-text transition-colors cursor-pointer py-1"
      >
        <Plus size={14} /> Add product
      </button>

      <SaveRow saving={saving} onCancel={onClose} onSave={handleSave} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic textarea form (audience, positioning)
// ---------------------------------------------------------------------------

function TextareaForm({
  clientId,
  label,
  fieldKey,
  value: initial,
  onClose,
  onSaved,
}: {
  clientId: string;
  label: string;
  fieldKey: 'target_audience_summary' | 'competitive_positioning';
  value: string;
  onClose: () => void;
  onSaved: (u: Partial<BrandGuidelineMetadata>) => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const patch = { [fieldKey]: value } as Partial<BrandGuidelineMetadata>;
    const ok = await saveBrandDNA(clientId, patch);
    setSaving(false);
    if (ok) {
      toast.success(`${label} saved`);
      onSaved(patch);
      onClose();
    } else {
      toast.error('Failed to save');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
          {label}
        </label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-colors resize-none"
        />
      </div>
      <SaveRow saving={saving} onCancel={onClose} onSave={handleSave} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable tag list editor
// ---------------------------------------------------------------------------

function TagListEditor({
  label,
  tags,
  onChange,
  placeholder,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  function addTag() {
    const val = input.trim();
    if (!val || tags.includes(val)) return;
    onChange([...tags, val]);
    setInput('');
  }

  function removeTag(i: number) {
    onChange(tags.filter((_, idx) => idx !== i));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="flex items-center gap-1 rounded-full bg-surface/60 px-2.5 py-0.5 text-xs text-text-secondary"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="text-text-muted hover:text-red-400 transition-colors cursor-pointer ml-0.5"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50 transition-colors"
        />
        <button
          type="button"
          onClick={addTag}
          disabled={!input.trim()}
          className="px-3 py-1.5 rounded-lg border border-nativz-border text-xs text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors cursor-pointer disabled:opacity-40"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save row
// ---------------------------------------------------------------------------

function SaveRow({
  saving,
  onCancel,
  onSave,
}: {
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2 border-t border-nativz-border">
      <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button size="sm" onClick={onSave} disabled={saving}>
        {saving ? 'Saving...' : <><Save size={14} /> Save</>}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sectionLabel(section: string): string {
  const map: Record<string, string> = {
    'Verbal identity': 'verbal identity',
    'Target audience': 'audience',
    'Competitive positioning': 'positioning',
    'Product catalog': 'products',
    'Content framing rules': 'content framing rules',
    'CTAs and quotes': 'CTAs and quotes',
    'Claim hygiene': 'claim hygiene & tone rules',
  };
  return map[section] ?? section.toLowerCase();
}

// ---------------------------------------------------------------------------
// Content framing rules form
// Edits BrandGuidelineMetadata.content_framing_rules — the structured
// scripting guardrails (funnel hierarchy, mandatory rule, CTA alignment,
// show-don't-imply, free-offer framing). These keys are read by
// lib/knowledge/brand-context.ts → formatPromptBlock and injected into
// Strategy Lab system prompts.
// ---------------------------------------------------------------------------

type FramingRules = {
  mandatory_rule?: string;
  cta_alignment?: string;
  show_dont_imply?: string;
  free_offer_framing?: string;
  funnel_hierarchy?: { top?: string; middle?: string; bottom?: string };
  [key: string]: unknown;
};

function FramingRulesForm({
  clientId,
  rules: initial,
  onClose,
  onSaved,
}: {
  clientId: string;
  rules: FramingRules;
  onClose: () => void;
  onSaved: (u: Partial<BrandGuidelineMetadata>) => void;
}) {
  const [mandatory, setMandatory] = useState((initial.mandatory_rule as string) ?? '');
  const [ctaAlignment, setCtaAlignment] = useState((initial.cta_alignment as string) ?? '');
  const [showDontImply, setShowDontImply] = useState((initial.show_dont_imply as string) ?? '');
  const [offerFraming, setOfferFraming] = useState((initial.free_offer_framing as string) ?? '');
  const [top, setTop] = useState(initial.funnel_hierarchy?.top ?? '');
  const [middle, setMiddle] = useState(initial.funnel_hierarchy?.middle ?? '');
  const [bottom, setBottom] = useState(initial.funnel_hierarchy?.bottom ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const next: FramingRules = {
      ...initial,
      mandatory_rule: mandatory.trim() || undefined,
      cta_alignment: ctaAlignment.trim() || undefined,
      show_dont_imply: showDontImply.trim() || undefined,
      free_offer_framing: offerFraming.trim() || undefined,
    };
    // Funnel hierarchy: only include when at least one stage is populated
    const hierarchy: { top?: string; middle?: string; bottom?: string } = {};
    if (top.trim()) hierarchy.top = top.trim();
    if (middle.trim()) hierarchy.middle = middle.trim();
    if (bottom.trim()) hierarchy.bottom = bottom.trim();
    if (Object.keys(hierarchy).length > 0) {
      next.funnel_hierarchy = hierarchy;
    } else {
      delete next.funnel_hierarchy;
    }
    // Drop undefined leaves so we don't persist empty keys
    for (const k of Object.keys(next)) {
      if (next[k] === undefined) delete next[k];
    }

    setSaving(true);
    const patch: Partial<BrandGuidelineMetadata> = {
      content_framing_rules: next as BrandGuidelineMetadata['content_framing_rules'],
      content_framing_rules_updated_at: new Date().toISOString().slice(0, 10),
    };
    const ok = await saveBrandDNA(clientId, patch);
    setSaving(false);
    if (ok) {
      toast.success('Content framing rules saved');
      onSaved(patch);
      onClose();
    } else {
      toast.error('Failed to save');
    }
  }

  return (
    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
      <LabeledTextarea
        label="Mandatory rule"
        hint="The one rule that must hold across every piece of content — e.g. 'Every script must mention spendability.'"
        value={mandatory}
        onChange={setMandatory}
        minRows={3}
      />

      <div>
        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
          Funnel hierarchy
        </label>
        <p className="text-[11px] text-text-muted/70 mb-2">
          What each funnel stage should emphasize. Leave blank if not applicable.
        </p>
        <div className="space-y-2">
          <StageInput label="Top (curiosity)" value={top} onChange={setTop} />
          <StageInput label="Middle (consideration)" value={middle} onChange={setMiddle} />
          <StageInput label="Bottom (action)" value={bottom} onChange={setBottom} />
        </div>
      </div>

      <LabeledTextarea
        label="CTA alignment"
        hint="How the opening hook should lead to the closing CTA."
        value={ctaAlignment}
        onChange={setCtaAlignment}
      />

      <LabeledTextarea
        label="Show, don't imply"
        hint="Visual rules — e.g. if the script says 'here's what you're getting,' the visual must show X not Y."
        value={showDontImply}
        onChange={setShowDontImply}
      />

      <LabeledTextarea
        label="Free/lead offer framing"
        hint="How to word lead offers — e.g. be specific about what the viewer receives."
        value={offerFraming}
        onChange={setOfferFraming}
      />

      <SaveRow saving={saving} onCancel={onClose} onSave={handleSave} />
    </div>
  );
}

function StageInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-3">
      <span className="text-xs text-text-muted">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What this stage emphasizes"
        className="w-full rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50 transition-colors"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CTAs & quote bank form
// Edits approved_ctas / banned_ctas / approved_quote_bank. Uses the
// long-form list editor because CTAs and quotes can exceed 80 chars and
// wrap awkwardly in the tag pill layout used for shorter vocabulary tags.
// ---------------------------------------------------------------------------

function CtasAndQuotesForm({
  clientId,
  approvedCtas: initialApproved,
  bannedCtas: initialBanned,
  approvedQuoteBank: initialQuotes,
  onClose,
  onSaved,
}: {
  clientId: string;
  approvedCtas: string[];
  bannedCtas: string[];
  approvedQuoteBank: string[];
  onClose: () => void;
  onSaved: (u: Partial<BrandGuidelineMetadata>) => void;
}) {
  const [approved, setApproved] = useState<string[]>(initialApproved);
  const [banned, setBanned] = useState<string[]>(initialBanned);
  const [quotes, setQuotes] = useState<string[]>(initialQuotes);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const patch: Partial<BrandGuidelineMetadata> = {
      approved_ctas: approved.map((s) => s.trim()).filter(Boolean),
      banned_ctas: banned.map((s) => s.trim()).filter(Boolean),
      approved_quote_bank: quotes.map((s) => s.trim()).filter(Boolean),
    };
    setSaving(true);
    const ok = await saveBrandDNA(clientId, patch);
    setSaving(false);
    if (ok) {
      toast.success('CTAs and quotes saved');
      onSaved(patch);
      onClose();
    } else {
      toast.error('Failed to save');
    }
  }

  return (
    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
      <LongListEditor
        label="Approved CTAs"
        hint="Use these verbatim (or as close variants) at the close of scripts."
        entries={approved}
        onChange={setApproved}
        placeholder='e.g. "Get yours free at example.com"'
      />
      <LongListEditor
        label="Banned CTAs"
        hint="Phrasings that must never appear in copy."
        entries={banned}
        onChange={setBanned}
        placeholder='e.g. "Fill out the form"'
      />
      <LongListEditor
        label="Approved quote bank"
        hint="On-brand quotes the nerd can reuse verbatim or adapt."
        entries={quotes}
        onChange={setQuotes}
        placeholder='e.g. "Gold holds what paper loses."'
      />
      <SaveRow saving={saving} onCancel={onClose} onSave={handleSave} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guardrails form — claim hygiene + short-form video rules + casting & tone
// ---------------------------------------------------------------------------

function GuardrailsForm({
  clientId,
  claimHygiene: initialClaim,
  videoRules: initialVideo,
  castingTone: initialTone,
  onClose,
  onSaved,
}: {
  clientId: string;
  claimHygiene: Record<string, string>;
  videoRules: Record<string, string>;
  castingTone: Record<string, string>;
  onClose: () => void;
  onSaved: (u: Partial<BrandGuidelineMetadata>) => void;
}) {
  const [claim, setClaim] = useState<KvEntry[]>(toKvEntries(initialClaim));
  const [video, setVideo] = useState<KvEntry[]>(toKvEntries(initialVideo));
  const [tone, setTone] = useState<KvEntry[]>(toKvEntries(initialTone));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const patch: Partial<BrandGuidelineMetadata> = {
      claim_hygiene_rules: fromKvEntries(claim),
      short_form_video_rules: fromKvEntries(video),
      casting_and_tone: fromKvEntries(tone),
    };
    setSaving(true);
    const ok = await saveBrandDNA(clientId, patch);
    setSaving(false);
    if (ok) {
      toast.success('Guardrails saved');
      onSaved(patch);
      onClose();
    } else {
      toast.error('Failed to save');
    }
  }

  return (
    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
      <KeyValueListEditor
        label="Claim hygiene"
        hint="Factual-accuracy rules. Key = short descriptor, value = the rule."
        entries={claim}
        onChange={setClaim}
        keyPlaceholder="e.g. gold_price_movement"
        valuePlaceholder='e.g. "Use ~8% avg over 25+ years, never ‘only goes up.’"'
      />
      <KeyValueListEditor
        label="Short-form video rules"
        hint="Rules specific to ≤15s / Reels / TikTok / Shorts output."
        entries={video}
        onChange={setVideo}
        keyPlaceholder="e.g. hook_to_cta"
        valuePlaceholder="How hooks should land the CTA."
      />
      <KeyValueListEditor
        label="Casting & tone"
        hint="Tone, casting, and influencer-read constraints."
        entries={tone}
        onChange={setTone}
        keyPlaceholder="e.g. tone"
        valuePlaceholder="Light-hearted, universal, optimistic."
      />
      <SaveRow saving={saving} onCancel={onClose} onSave={handleSave} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Long-form list editor — one row per entry, long inputs. Used for CTAs
// and quotes where entries often exceed 60 chars.
// ---------------------------------------------------------------------------

function LongListEditor({
  label,
  hint,
  entries,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  entries: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  function add() {
    onChange([...entries, '']);
  }
  function update(i: number, v: string) {
    onChange(entries.map((e, idx) => (idx === i ? v : e)));
  }
  function remove(i: number) {
    onChange(entries.filter((_, idx) => idx !== i));
  }
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
        {label}
      </label>
      {hint ? <p className="text-[11px] text-text-muted/70 mb-2">{hint}</p> : null}
      <div className="space-y-2 mb-2">
        {entries.length === 0 ? (
          <p className="text-xs text-text-muted/50 italic">None yet — add one below.</p>
        ) : (
          entries.map((entry, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                type="text"
                value={entry}
                onChange={(e) => update(i, e.target.value)}
                placeholder={placeholder}
                className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded-lg border border-nativz-border px-2 py-1.5 text-text-muted hover:text-red-400 hover:border-red-400/50 transition-colors cursor-pointer"
                aria-label="Remove entry"
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors cursor-pointer"
      >
        <Plus size={12} /> Add
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key-value list editor — stable row identity via local uuid so input focus
// doesn't jump when a key is edited. Used for claim_hygiene / short-form
// video / casting & tone rules.
// ---------------------------------------------------------------------------

type KvEntry = { id: string; key: string; value: string };

function toKvEntries(obj: Record<string, string>): KvEntry[] {
  return Object.entries(obj ?? {}).map(([key, value]) => ({
    id: `${key}-${Math.random().toString(36).slice(2, 9)}`,
    key,
    value: value ?? '',
  }));
}

function fromKvEntries(entries: KvEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    const k = e.key.trim();
    const v = e.value.trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function KeyValueListEditor({
  label,
  hint,
  entries,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  label: string;
  hint?: string;
  entries: KvEntry[];
  onChange: (next: KvEntry[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  function add() {
    onChange([
      ...entries,
      { id: `new-${Math.random().toString(36).slice(2, 9)}`, key: '', value: '' },
    ]);
  }
  function update(i: number, field: 'key' | 'value', v: string) {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, [field]: v } : e)));
  }
  function remove(i: number) {
    onChange(entries.filter((_, idx) => idx !== i));
  }
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
        {label}
      </label>
      {hint ? <p className="text-[11px] text-text-muted/70 mb-2">{hint}</p> : null}
      <div className="space-y-2 mb-2">
        {entries.length === 0 ? (
          <p className="text-xs text-text-muted/50 italic">None yet — add one below.</p>
        ) : (
          entries.map((entry, i) => (
            <div key={entry.id} className="rounded-lg border border-nativz-border bg-background/40 p-2 space-y-1.5">
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={entry.key}
                  onChange={(e) => update(i, 'key', e.target.value)}
                  placeholder={keyPlaceholder}
                  className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="rounded-lg border border-nativz-border px-2 py-1.5 text-text-muted hover:text-red-400 hover:border-red-400/50 transition-colors cursor-pointer"
                  aria-label="Remove rule"
                >
                  <X size={14} />
                </button>
              </div>
              <textarea
                value={entry.value}
                onChange={(e) => update(i, 'value', e.target.value)}
                placeholder={valuePlaceholder}
                rows={2}
                className="w-full rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50 transition-colors resize-y"
              />
            </div>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-xs text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors cursor-pointer"
      >
        <Plus size={12} /> Add rule
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labeled textarea — multi-line field with optional hint + minRows.
// ---------------------------------------------------------------------------

function LabeledTextarea({
  label,
  hint,
  value,
  onChange,
  minRows = 2,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
        {label}
      </label>
      {hint ? <p className="text-[11px] text-text-muted/70 mb-2">{hint}</p> : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={minRows}
        className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50 transition-colors resize-y"
      />
    </div>
  );
}
