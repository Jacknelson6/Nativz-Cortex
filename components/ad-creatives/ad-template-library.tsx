'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Upload, Loader2, Trash2, X, Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types — mirror the ad_prompt_templates row shape. Only the fields the UI
// consumes are listed; extra columns are ignored.
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

// Matches AD_CATEGORIES from lib/ad-creatives/types.ts. Duplicated here so the
// template library isn't dragging in the full ad-creatives types module.
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

// 10 MB matches the upload route's ceiling.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Polling interval for in-flight extractions. The Gemini vision call
// typically settles within 5-15s; we poll every 3s so the UI reflects it
// without hammering the DB.
const EXTRACTION_POLL_MS = 3000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  clientId: string;
  initialTemplates: AdPromptTemplate[];
}

/**
 * Per-client ad-template library. Admins drop an ad screenshot, the
 * server runs it through Gemini vision to extract a reproducible JSON
 * spec (layout / composition / typography / color strategy / content
 * blocks), and the extracted schema powers Phase-2 generation.
 *
 * Existing backend: POST /api/clients/[id]/ad-creatives/templates kicks
 * extraction off as a Vercel `after()` background task. This UI polls
 * the list until every row has a non-empty prompt_schema so admins see
 * extraction finish in-place instead of refreshing.
 */
export function AdTemplateLibrary({ clientId, initialTemplates }: Props) {
  const [templates, setTemplates] = useState<AdPromptTemplate[]>(initialTemplates);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const openTemplate = useMemo(
    () => templates.find((t) => t.id === openTemplateId) ?? null,
    [templates, openTemplateId],
  );

  // Refetch the full list — cheap, and keeps this file from needing to
  // reconcile partial updates against polling state.
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
      // Network blip — silent, next poll will retry.
    }
  }, [clientId]);

  // Poll while any row has an empty prompt_schema (extraction pending).
  // Stops the interval once everything has settled so we're not chatty
  // when the library is idle.
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

  const handleUploadComplete = useCallback(
    (template: AdPromptTemplate) => {
      setTemplates((prev) => [template, ...prev]);
      setUploadOpen(false);
    },
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-muted">
            Drop winning ad screenshots here. We extract the structural JSON
            (layout / composition / typography / color strategy) so Phase-2
            generation can reproduce the pattern with the active brand's content.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
        >
          <Upload size={14} />
          Upload template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-10 text-center">
          <p className="text-sm text-text-muted">
            No templates yet. Upload a reference ad screenshot to get started —
            the vision model extracts its structure into a reusable JSON spec.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
    <div className="group relative overflow-hidden rounded-lg border border-nativz-border bg-surface">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full cursor-pointer text-left"
      >
        <div className="relative aspect-square bg-surface-hover">
          <Image
            src={template.reference_image_url}
            alt={template.name}
            width={360}
            height={360}
            className="h-full w-full object-cover"
          />
          {pending && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-1.5 text-white/90">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-[11px] font-medium">Extracting…</span>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-0.5 p-2">
          <p className="truncate text-[12px] font-medium text-text-primary" title={template.name}>
            {template.name}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-text-muted/70">
            {category.replaceAll('_', ' ')}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${template.name}`}
        title={`Delete ${template.name}`}
        className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-surface/90 text-text-muted opacity-0 shadow-sm transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </div>
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

      // Construct an optimistic row so the grid shows it immediately in
      // "Extracting…" state. The polling loop will replace it with the
      // server truth once extraction completes.
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
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/50 px-5 py-3">
          <p className="text-sm font-semibold text-text-primary">Upload ad template</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">
              Reference image (JPEG / PNG / WebP, max 10 MB)
            </label>
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-lg border border-nativz-border">
                {/* Preview is a blob: URL from URL.createObjectURL — Next/Image
                    can't resolve blob URLs, so this stays an <img>. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="preview"
                  className="h-48 w-full object-contain bg-background"
                />
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80"
                  aria-label="Remove file"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-nativz-border bg-background text-sm text-text-muted transition-colors hover:border-accent/50 hover:text-text-secondary"
              >
                <Upload size={18} />
                Click to pick an image
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 'Testimonial card — five-star overlay'"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent/40 focus:outline-none"
            >
              {AD_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">
              Tags (optional, comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. split-screen, product-hero, sale"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-nativz-border/50 bg-surface/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !file || !name.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload &amp; extract
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog — preview + JSON viewer
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/50 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary" title={template.name}>
              {template.name}
            </p>
            <p className="truncate text-[11px] text-text-muted">
              {(template.ad_category ?? 'other').replaceAll('_', ' ')}
              {template.tags && template.tags.length > 0 ? ` · ${template.tags.join(' · ')}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          <div className="flex min-h-0 items-center justify-center bg-background p-4 md:border-r md:border-nativz-border/50">
            <Image
              src={template.reference_image_url}
              alt={template.name}
              width={600}
              height={600}
              className="max-h-[520px] w-auto object-contain"
            />
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 border-b border-nativz-border/50 px-4 py-2 text-xs text-text-muted">
              {pending ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Extracting structure…
                </>
              ) : (
                <>
                  <Eye size={12} /> Extracted spec
                </>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-3">
              {pending ? (
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <RefreshCw size={14} className="animate-spin" />
                  Vision model is reading the layout. This usually takes 5–15s.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExtractionPending(t: AdPromptTemplate): boolean {
  // The POST route seeds prompt_schema with an empty object and the
  // background extractor replaces it. Treat {} (or missing/null) as
  // "still running". A successful extraction populates at least the
  // `layout` + `composition` blocks.
  const s = t.prompt_schema;
  if (!s || typeof s !== 'object') return true;
  return Object.keys(s).length === 0;
}
