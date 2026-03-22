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

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {colors.map((color, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-nativz-border bg-background px-3 py-2">
            {/* Hex picker */}
            <div className="relative shrink-0">
              <div
                className="h-9 w-9 rounded-lg border border-white/10 cursor-pointer"
                style={{ backgroundColor: color.hex }}
              />
              <input
                type="color"
                value={color.hex}
                onChange={(e) => update(i, 'hex', e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
            <input
              type="text"
              value={color.hex}
              onChange={(e) => update(i, 'hex', e.target.value)}
              placeholder="#3b82f6"
              className="w-24 rounded bg-transparent text-xs font-mono text-text-secondary border-none outline-none focus:ring-1 focus:ring-accent/50 px-1 py-0.5"
            />
            <input
              type="text"
              value={color.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              placeholder="Color name"
              className="flex-1 rounded bg-transparent text-sm text-text-primary border-none outline-none focus:ring-1 focus:ring-accent/50 px-1 py-0.5"
            />
            <select
              value={color.role}
              onChange={(e) => update(i, 'role', e.target.value)}
              className="text-xs text-text-muted bg-background rounded border border-nativz-border px-1.5 py-0.5 outline-none focus:border-accent/50"
            >
              {COLOR_ROLES.map((r) => (
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

const OFFERING_TYPE_OPTIONS: { value: ProductOfferingType | ''; label: string }[] = [
  { value: '', label: 'Offering type' },
  { value: 'product', label: 'Product' },
  { value: 'service', label: 'Service' },
  { value: 'affiliate_program', label: 'Affiliate program' },
  { value: 'ambassador_program', label: 'Ambassador program' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'other', label: 'Other' },
];

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
    const filtered = products.filter((p) => p.name.trim());
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
                  value={product.offeringType ?? ''}
                  onChange={(e) => update(i, 'offeringType', e.target.value)}
                  className="w-full rounded bg-background text-[11px] text-text-muted border border-nativz-border px-1.5 py-1 outline-none focus:border-accent/50"
                >
                  {OFFERING_TYPE_OPTIONS.map((o) => (
                    <option key={o.label} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  type="url"
                  value={product.imageUrl ?? ''}
                  onChange={(e) => update(i, 'imageUrl', e.target.value)}
                  placeholder="Image URL (optional)"
                  className="w-full rounded bg-transparent text-[11px] text-text-muted border-b border-nativz-border/50 outline-none focus:border-accent/50 px-1 py-0.5"
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
            className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-text-secondary"
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
  };
  return map[section] ?? section.toLowerCase();
}
