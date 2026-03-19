'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  Link2,
  CheckCircle2,
  XCircle,
  Loader2,
  ImagePlus,
  Globe,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AD_CATEGORIES } from '@/lib/ad-creatives/types';
import type { AdCategory } from '@/lib/ad-creatives/types';

const CATEGORY_LABELS: Record<AdCategory, string> = {
  promotional: 'Promotional',
  brand_awareness: 'Brand awareness',
  product_showcase: 'Product showcase',
  testimonial: 'Testimonial',
  seasonal: 'Seasonal',
  retargeting: 'Retargeting',
  lead_generation: 'Lead generation',
  event: 'Event',
  educational: 'Educational',
  comparison: 'Comparison',
};

type ImportMode = 'upload' | 'scrape';

interface FileStatus {
  name: string;
  file: File | null;
  preview: string | null;
  status: 'pending' | 'uploading' | 'extracting' | 'complete' | 'failed';
  templateId?: string;
  error?: string;
}

interface ScrapeResult {
  found: number;
  imported: number;
  templates: { id: string; name: string }[];
  errors: string[];
}

interface BulkTemplateImportProps {
  clientId: string;
  onClose: () => void;
  onImportComplete: () => void;
}

export function BulkTemplateImport({
  clientId,
  onClose,
  onImportComplete,
}: BulkTemplateImportProps) {
  const [mode, setMode] = useState<ImportMode>('upload');
  const [adCategory, setAdCategory] = useState<AdCategory>('promotional');

  // Upload state
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scrape state
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const isDragOver = useRef(false);
  const [dragActive, setDragActive] = useState(false);

  // ---------- File upload handling ----------

  const handleFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles: FileStatus[] = [];
    const fileArray = Array.from(fileList).slice(0, 50);

    for (const file of fileArray) {
      // Client-side validation
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.type)) {
        newFiles.push({
          name: file.name,
          file: null,
          preview: null,
          status: 'failed',
          error: 'Invalid file type',
        });
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        newFiles.push({
          name: file.name,
          file: null,
          preview: null,
          status: 'failed',
          error: 'File too large (max 10 MB)',
        });
        continue;
      }

      newFiles.push({
        name: file.name,
        file,
        preview: URL.createObjectURL(file),
        status: 'pending',
      });
    }

    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const startBulkUpload = useCallback(async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending' && f.file);
    if (pendingFiles.length === 0) return;

    setUploading(true);

    // Mark all pending as uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.status === 'pending' && f.file ? { ...f, status: 'uploading' as const } : f,
      ),
    );

    // Build FormData with all pending files
    const formData = new FormData();
    formData.append('ad_category', adCategory);
    for (const f of pendingFiles) {
      if (f.file) formData.append('files', f.file);
    }

    try {
      const res = await fetch(`/api/clients/${clientId}/ad-creatives/templates/bulk`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        // Mark all uploading as failed
        setFiles((prev) =>
          prev.map((f) =>
            f.status === 'uploading'
              ? { ...f, status: 'failed' as const, error: data.error ?? 'Upload failed' }
              : f,
          ),
        );
        return;
      }

      // Map results back to file statuses
      const successTemplates: { id: string; name: string; status: string }[] =
        data.templates ?? [];
      const failedTemplates: { name: string; error: string }[] = data.failed ?? [];

      const templatesByName = new Map(
        successTemplates.map((t) => [t.name, t]),
      );
      const failedByName = new Map(
        failedTemplates.map((f) => [f.name, f]),
      );

      setFiles((prev) =>
        prev.map((f) => {
          if (f.status !== 'uploading') return f;
          const cleanName =
            f.name.replace(/\.\w+$/, '').replace(/[_-]/g, ' ').trim() || 'Imported ad';

          const failedEntry = failedByName.get(f.name);
          if (failedEntry) {
            return { ...f, status: 'failed' as const, error: failedEntry.error };
          }

          const templateEntry = templatesByName.get(cleanName);
          if (templateEntry) {
            return {
              ...f,
              status: 'complete' as const,
              templateId: templateEntry.id,
            };
          }

          // If we can't match by name, mark as complete if there were successful imports
          return data.templates?.length > 0
            ? { ...f, status: 'complete' as const }
            : { ...f, status: 'failed' as const, error: 'Unknown error' };
        }),
      );

      if ((data.templates?.length ?? 0) > 0) {
        onImportComplete();
      }
    } catch {
      setFiles((prev) =>
        prev.map((f) =>
          f.status === 'uploading'
            ? { ...f, status: 'failed' as const, error: 'Network error' }
            : f,
        ),
      );
    } finally {
      setUploading(false);
    }
  }, [files, adCategory, clientId, onImportComplete]);

  // ---------- Scrape handling ----------

  const startScrape = useCallback(async () => {
    if (!scrapeUrl.trim()) return;

    setScraping(true);
    setScrapeError(null);
    setScrapeResult(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/ad-creatives/templates/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl, ad_category: adCategory }),
      });

      const data = await res.json();

      if (!res.ok) {
        setScrapeError(data.error ?? 'Scrape failed');
        return;
      }

      setScrapeResult(data);

      if (data.imported > 0) {
        onImportComplete();
      }
    } catch {
      setScrapeError('Network error. Please try again.');
    } finally {
      setScraping(false);
    }
  }, [clientId, scrapeUrl, adCategory, onImportComplete]);

  const completedCount = files.filter((f) => f.status === 'complete').length;
  const failedCount = files.filter((f) => f.status === 'failed').length;
  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const processingCount = files.filter(
    (f) => f.status === 'uploading' || f.status === 'extracting',
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Bulk import templates</h2>
          <p className="text-sm text-text-muted mt-0.5">
            Import multiple ad templates at once via file upload or URL scraping
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface transition-colors cursor-pointer"
        >
          <X size={18} className="text-text-muted" />
        </button>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-surface rounded-xl p-1 w-fit">
        <button
          onClick={() => setMode('upload')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
            mode === 'upload'
              ? 'bg-background text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <ImagePlus size={15} />
          File upload
        </button>
        <button
          onClick={() => setMode('scrape')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
            mode === 'scrape'
              ? 'bg-background text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <Globe size={15} />
          Scrape URL
        </button>
      </div>

      {/* Category selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text-secondary">Ad category</label>
        <select
          value={adCategory}
          onChange={(e) => setAdCategory(e.target.value as AdCategory)}
          className="appearance-none rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none w-full max-w-xs"
        >
          {AD_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {/* Upload mode */}
      {mode === 'upload' && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all cursor-pointer ${
              dragActive
                ? 'border-accent bg-accent-surface/10'
                : 'border-nativz-border hover:border-accent/40 hover:bg-surface/50'
            }`}
          >
            <Upload
              size={32}
              className={`mb-3 ${dragActive ? 'text-accent-text' : 'text-text-muted'}`}
            />
            <p className="text-sm font-medium text-text-primary">
              Drop ad images here or click to browse
            </p>
            <p className="text-xs text-text-muted mt-1">
              PNG, JPG, or WebP. Up to 50 files, max 10 MB each.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* File preview grid */}
          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-secondary">
                  {files.length} {files.length === 1 ? 'file' : 'files'} selected
                  {completedCount > 0 && (
                    <span className="text-green-400 ml-2">
                      {completedCount} imported
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span className="text-red-400 ml-2">
                      {failedCount} failed
                    </span>
                  )}
                </p>
                {pendingCount > 0 && !uploading && (
                  <button
                    onClick={startBulkUpload}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 cursor-pointer"
                  >
                    <Upload size={14} />
                    Import {pendingCount} {pendingCount === 1 ? 'file' : 'files'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="relative group rounded-lg bg-surface border border-nativz-border overflow-hidden"
                  >
                    {file.preview ? (
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="w-full aspect-square object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center bg-surface">
                        <XCircle size={20} className="text-red-400" />
                      </div>
                    )}

                    {/* Status overlay */}
                    <div
                      className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                        file.status === 'pending'
                          ? 'opacity-0 group-hover:opacity-100 bg-black/40'
                          : file.status === 'complete'
                            ? 'bg-green-900/40'
                            : file.status === 'failed'
                              ? 'bg-red-900/40'
                              : 'bg-black/50'
                      }`}
                    >
                      {file.status === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 transition-colors cursor-pointer"
                        >
                          <X size={14} className="text-white" />
                        </button>
                      )}
                      {(file.status === 'uploading' || file.status === 'extracting') && (
                        <Loader2 size={20} className="text-white animate-spin" />
                      )}
                      {file.status === 'complete' && (
                        <CheckCircle2 size={20} className="text-green-400" />
                      )}
                      {file.status === 'failed' && (
                        <div className="text-center px-2">
                          <XCircle size={18} className="text-red-400 mx-auto" />
                          <p className="text-[10px] text-red-300 mt-1 line-clamp-2">
                            {file.error}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* File name */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                      <p className="text-[10px] text-white truncate">{file.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scrape mode */}
      {mode === 'scrape' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface border border-nativz-border p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-text-muted">
                This works best with pages that render images in static HTML. JavaScript-rendered
                pages (like Meta Ad Library) may return limited results. For those, download the
                images manually and use file upload.
              </p>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="url"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="https://www.facebook.com/ads/library/..."
                  className="w-full rounded-lg border border-nativz-border bg-background pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-accent focus:outline-none"
                  disabled={scraping}
                />
              </div>
              <button
                onClick={startScrape}
                disabled={scraping || !scrapeUrl.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                {scraping ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Globe size={14} />
                    Scrape
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Scrape error */}
          {scrapeError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 flex items-start gap-2">
              <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{scrapeError}</p>
            </div>
          )}

          {/* Scrape results */}
          {scrapeResult && (
            <div className="rounded-xl bg-surface border border-nativz-border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant={scrapeResult.imported > 0 ? 'success' : 'default'}>
                  {scrapeResult.imported} imported
                </Badge>
                <span className="text-xs text-text-muted">
                  {scrapeResult.found} images found on page
                </span>
              </div>

              {scrapeResult.templates.length > 0 && (
                <div className="space-y-1">
                  {scrapeResult.templates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 text-xs text-text-secondary"
                    >
                      <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                      {t.name}
                      <span className="text-text-muted">(analyzing...)</span>
                    </div>
                  ))}
                </div>
              )}

              {scrapeResult.errors.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-nativz-border">
                  <p className="text-xs font-medium text-text-muted">Issues:</p>
                  {scrapeResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-300/80">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
