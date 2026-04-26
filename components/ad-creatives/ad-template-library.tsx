'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Upload, Loader2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdPromptTemplate {
  id: string;
  name: string;
  reference_image_url: string;
  prompt_schema: Record<string, unknown>;
  aspect_ratio: '1:1' | '4:5' | '9:16' | '16:9' | '1.91:1';
  ad_category: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

const AD_CATEGORIES: { value: string; label: string }[] = [
  { value: 'promotional', label: 'Promotional' },
  { value: 'brand_awareness', label: 'Brand awareness' },
  { value: 'product_showcase', label: 'Product showcase' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'retargeting', label: 'Retargeting' },
  { value: 'lead_generation', label: 'Lead generation' },
  { value: 'event', label: 'Event' },
  { value: 'educational', label: 'Educational' },
  { value: 'comparison', label: 'Comparison' },
];

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const EXTRACTION_POLL_MS = 3000;

const DISPLAY_FONT = 'var(--font-nz-display), system-ui, sans-serif';
const BODY_FONT = 'Poppins, system-ui, sans-serif';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  clientId: string;
  initialTemplates: AdPromptTemplate[];
}

export function AdTemplateLibrary({ clientId, initialTemplates }: Props) {
  const [templates, setTemplates] = useState<AdPromptTemplate[]>(initialTemplates);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const openTemplate = useMemo(
    () => templates.find((t) => t.id === openTemplateId) ?? null,
    [templates, openTemplateId],
  );

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/clients/${clientId}/ad-creatives/templates?limit=500`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { templates: AdPromptTemplate[] };
      setTemplates(data.templates ?? []);
    } catch {
      // silent — next poll retries
    }
  }, [clientId]);

  useEffect(() => {
    const pending = templates.some((t) => isExtractionPending(t));
    if (!pending) return;
    const interval = setInterval(() => {
      void refetch();
    }, EXTRACTION_POLL_MS);
    return () => clearInterval(interval);
  }, [templates, refetch]);

  const handleDelete = useCallback(
    async (id: string) => {
      const prev = templates;
      setTemplates((current) => current.filter((t) => t.id !== id));
      if (openTemplateId === id) setOpenTemplateId(null);
      try {
        const res = await fetch(
          `/api/clients/${clientId}/ad-creatives/templates/${id}`,
          { method: 'DELETE' },
        );
        if (!res.ok) throw new Error('delete failed');
      } catch {
        setTemplates(prev);
        toast.error('Could not delete template');
      }
    },
    [clientId, openTemplateId, templates],
  );

  const handleUploadComplete = useCallback((template: AdPromptTemplate) => {
    setTemplates((prev) => [template, ...prev]);
    setUploadOpen(false);
  }, []);

  return (
    <div className="space-y-7">
      {/* ── Header strip ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl space-y-1">
          <p className="nz-eyebrow">Pattern library</p>
          <p
            className="text-sm text-text-muted leading-relaxed"
            style={{ fontFamily: BODY_FONT, fontWeight: 300 }}
          >
            Drop winning ad screenshots here. Cortex extracts the structural
            spec — layout, composition, typography, color strategy — so the
            generator can reproduce the pattern in this brand&apos;s voice.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          <Upload size={14} />
          Upload template
        </button>
      </div>

      {templates.length === 0 ? (
        <EmptyTemplates />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onOpen={() => setOpenTemplateId(t.id)}
              onDelete={() => void handleDelete(t.id)}
            />
          ))}
        </div>
      )}

      {uploadOpen && (
        <UploadDialog
          clientId={clientId}
          onClose={() => setUploadOpen(false)}
          onComplete={handleUploadComplete}
        />
      )}

      {openTemplate && (
        <TemplateDetailDialog
          template={openTemplate}
          onClose={() => setOpenTemplateId(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyTemplates() {
  return (
    <div className="space-y-2 py-12">
      <p className="nz-eyebrow">Pattern library</p>
      <h3
        className="text-[22px] leading-tight text-text-primary"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        No templates yet
      </h3>
      <p
        className="max-w-xl text-sm text-text-muted leading-relaxed"
        style={{ fontFamily: BODY_FONT, fontWeight: 300 }}
      >
        Upload a reference ad screenshot to get started. The vision model
        extracts its structure into a reusable JSON spec — every future batch
        can pull from this library.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onOpen,
  onDelete,
}: {
  template: AdPromptTemplate;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const pending = isExtractionPending(template);
  const category = template.ad_category ?? 'other';

  return (
    <article className="group flex flex-col gap-2">
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full cursor-pointer overflow-hidden rounded-lg ring-1 ring-nativz-border/60 bg-surface-hover transition-all duration-200 hover:ring-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60"
        aria-label={`Open template ${template.name}`}
      >
        <div className="aspect-square">
          <Image
            src={template.reference_image_url}
            alt={template.name}
            width={360}
            height={360}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
          />
        </div>

        {pending && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-text-primary">
              <Loader2 size={18} className="animate-spin text-accent" />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                Extracting
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${template.name}`}
          title={`Delete ${template.name}`}
          className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-bg/80 text-text-muted opacity-0 backdrop-blur-sm transition-all hover:bg-nz-coral/90 hover:text-white group-hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60"
        >
          <Trash2 size={12} />
        </button>
      </button>

      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/80">
          {category.replaceAll('_', ' ')}
        </p>
        <p
          className="truncate text-[13px] text-text-primary leading-tight"
          title={template.name}
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {template.name}
        </p>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Upload dialog
// ---------------------------------------------------------------------------

function UploadDialog({
  clientId,
  onClose,
  onComplete,
}: {
  clientId: string;
  onClose: () => void;
  onComplete: (template: AdPromptTemplate) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('promotional');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleSubmit = useCallback(async () => {
    if (!file) {
      toast.error('Pick an image first');
      return;
    }
    if (!name.trim()) {
      toast.error('Give the template a name');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('File exceeds the 10 MB limit');
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', name.trim());
      form.append('ad_category', category);
      if (tags.trim()) form.append('tags', tags.trim());

      const res = await fetch(
        `/api/clients/${clientId}/ad-creatives/templates`,
        { method: 'POST', body: form },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? `Upload failed (${res.status})`);
        return;
      }
      const { templateId } = (await res.json()) as { templateId: string; status: string };

      const optimistic: AdPromptTemplate = {
        id: templateId,
        name: name.trim(),
        reference_image_url: previewUrl ?? '',
        prompt_schema: {},
        aspect_ratio: '1:1',
        ad_category: category,
        tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onComplete(optimistic);
      toast.success('Uploaded — extracting structure…');
    } finally {
      setSubmitting(false);
    }
  }, [file, name, category, tags, clientId, previewUrl, onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-nativz-border/50 px-6 py-4">
          <div className="space-y-1">
            <p className="nz-eyebrow">Pattern library</p>
            <h2
              className="text-[20px] leading-tight text-text-primary"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              Add a new template
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          <Field label="Reference image" hint="JPEG, PNG, or WebP — 10 MB max">
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-lg ring-1 ring-nativz-border/60 bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="preview"
                  className="h-48 w-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-bg/80 text-white backdrop-blur-sm transition-colors hover:bg-nz-coral/90"
                  aria-label="Remove file"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-background ring-1 ring-inset ring-nativz-border/60 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:ring-accent/40 hover:text-text-secondary"
              >
                <Upload size={18} />
                <span style={{ fontFamily: BODY_FONT, fontWeight: 300 }}>
                  Click to pick an image
                </span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>

          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Testimonial card — five-star overlay"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/70 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
              style={{ fontFamily: BODY_FONT, fontWeight: 300 }}
            />
          </Field>

          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
              style={{ fontFamily: BODY_FONT, fontWeight: 300 }}
            >
              {AD_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tags" hint="Optional, comma-separated">
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="split-screen, product-hero, sale"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/70 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
              style={{ fontFamily: BODY_FONT, fontWeight: 300 }}
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-nativz-border/50 bg-surface/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-muted transition-colors hover:text-text-primary cursor-pointer"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !file || !name.trim()}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-default disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            {submitting ? 'Uploading' : 'Upload & extract'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          className="text-[13px] italic text-text-secondary"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {label}
        </label>
        {hint && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/70">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------

function TemplateDetailDialog({
  template,
  onClose,
}: {
  template: AdPromptTemplate;
  onClose: () => void;
}) {
  const pending = isExtractionPending(template);
  const schemaPretty = useMemo(
    () => JSON.stringify(template.prompt_schema, null, 2),
    [template.prompt_schema],
  );
  const category = (template.ad_category ?? 'other').replaceAll('_', ' ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-nativz-border/50 px-6 py-4">
          <div className="min-w-0 space-y-1">
            <p className="nz-eyebrow">
              {category}
              {template.tags && template.tags.length > 0 && (
                <span className="text-text-muted/70 italic">
                  {' '}
                  · {template.tags.join(' · ')}
                </span>
              )}
            </p>
            <h2
              className="truncate text-[22px] leading-tight text-text-primary"
              title={template.name}
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {template.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          {/* Reference image */}
          <div className="flex min-h-0 items-center justify-center bg-background p-5 md:border-r md:border-nativz-border/50">
            <Image
              src={template.reference_image_url}
              alt={template.name}
              width={600}
              height={600}
              className="max-h-[520px] w-auto rounded-lg object-contain ring-1 ring-nativz-border/60"
            />
          </div>

          {/* Spec column */}
          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-nativz-border/50 px-5 py-3">
              <span
                className="text-[13px] italic text-text-secondary"
                style={{ fontFamily: DISPLAY_FONT }}
              >
                Extracted spec
              </span>
              <StatusDot pending={pending} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-background px-5 py-4">
              {pending ? (
                <div className="space-y-2">
                  <p className="nz-eyebrow">Vision pass</p>
                  <p
                    className="text-sm text-text-muted leading-relaxed"
                    style={{ fontFamily: BODY_FONT, fontWeight: 300 }}
                  >
                    Reading the layout, composition, typography, and color
                    strategy. This usually takes 5–15s.
                  </p>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-text-secondary">
                  {schemaPretty}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ pending }: { pending: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          pending ? 'bg-amber-400 animate-pulse' : 'bg-accent'
        }`}
      />
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
          pending ? 'text-text-secondary' : 'text-text-muted'
        }`}
      >
        {pending ? 'Extracting' : 'Ready'}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExtractionPending(t: AdPromptTemplate): boolean {
  const s = t.prompt_schema;
  if (!s || typeof s !== 'object') return true;
  return Object.keys(s).length === 0;
}
