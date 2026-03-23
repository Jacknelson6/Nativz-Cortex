'use client';

import { useState } from 'react';
import { ArrowLeft, Search, Globe, Sparkles, Loader2, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useClientAdminShell } from '@/components/clients/client-admin-shell-context';

interface VaultHeaderProps {
  clientId: string;
  clientName: string;
  clientSlug: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onEntriesChanged?: () => void;
}

export function VaultHeader({
  clientId,
  clientName,
  clientSlug,
  searchQuery,
  onSearchChange,
  onEntriesChanged,
}: VaultHeaderProps) {
  const shell = useClientAdminShell();
  const [scraping, setScraping] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState('note');
  const [addTitle, setAddTitle] = useState('');
  const [addContent, setAddContent] = useState('');
  const [adding, setAdding] = useState(false);

  const ENTRY_TYPES = [
    { value: 'note', label: 'Note' },
    { value: 'document', label: 'Document' },
    { value: 'brand_asset', label: 'Brand asset' },
    { value: 'idea', label: 'Idea' },
    { value: 'web_page', label: 'Web page' },
  ];

  async function handleAddEntry() {
    if (!addTitle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: addType, title: addTitle.trim(), content: addContent.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed to create');
      toast.success('Entry added');
      setAddTitle('');
      setAddContent('');
      setShowAdd(false);
      onEntriesChanged?.();
    } catch {
      toast.error('Failed to add entry');
    } finally {
      setAdding(false);
    }
  }

  async function handleScrape() {
    setScraping(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxPages: 30, maxDepth: 2 }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(d.error ?? 'Failed to scrape');
      }
      const data = await res.json();
      toast.success(`Scraped ${data.count} pages`);
      onEntriesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scrape website');
    } finally {
      setScraping(false);
    }
  }

  async function handleGenerateProfile() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge/brand-profile`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(d.error ?? 'Failed to generate');
      }
      toast.success('Brand profile generated');
      onEntriesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate brand profile');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-nativz-border bg-background shrink-0">
      <div className="flex items-center gap-3">
        {!shell && (
          <Link
            href={`/admin/clients/${clientSlug}`}
            className="text-text-muted hover:text-text-secondary transition-colors p-1 rounded-lg hover:bg-surface-hover"
          >
            <ArrowLeft size={16} />
          </Link>
        )}
        <h1 className="ui-chrome-title">
          {clientName}&apos;s vault
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleScrape}
          disabled={scraping}
          className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors cursor-pointer"
        >
          {scraping ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
          {scraping ? 'Scraping...' : 'Scrape website'}
        </button>
        <button
          onClick={handleGenerateProfile}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 border border-accent/20 px-3 py-1.5 text-xs text-accent-text hover:bg-accent/20 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {generating ? 'Generating...' : 'Generate brand profile'}
        </button>

        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer"
        >
          <Plus size={12} />
          Add entry
        </button>

        <div className="w-px h-5 bg-nativz-border mx-1" />

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search entries..."
            className="w-52 rounded-lg border border-nativz-border bg-surface pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* Add entry modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAdd(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-nativz-border bg-surface p-5 shadow-elevated">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Add knowledge entry</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded-lg text-text-muted hover:text-text-primary cursor-pointer">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Type</label>
                <select
                  value={addType}
                  onChange={(e) => setAddType(e.target.value)}
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none"
                >
                  {ENTRY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Title</label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
                  placeholder="Entry title..."
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Content <span className="text-text-muted/50">(optional)</span></label>
                <textarea
                  value={addContent}
                  onChange={(e) => setAddContent(e.target.value)}
                  placeholder="Entry content..."
                  rows={4}
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEntry}
                  disabled={!addTitle.trim() || adding}
                  className="px-4 py-1.5 rounded-lg bg-accent text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40 cursor-pointer"
                >
                  {adding ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
