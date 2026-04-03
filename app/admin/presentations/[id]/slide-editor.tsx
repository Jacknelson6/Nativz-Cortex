'use client';

import { useState } from 'react';
import {
  ArrowLeft, Plus, Trash2, Save, Play, Image, ChevronUp, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker';
import type { Slide, PresentationData } from './types';

// ─── Slide Editor ────────────────────────────────────────────────────────────

export function SlideEditor({
  presentation,
  saving,
  clients,
  update,
  onSave,
  onBack,
  onPresent,
}: {
  presentation: PresentationData;
  saving: boolean;
  clients: ClientOption[];
  update: (partial: Partial<PresentationData>) => void;
  onSave: () => void;
  onBack: () => void;
  onPresent: () => void;
}) {
  const [activeSlide, setActiveSlide] = useState(0);

  function updateSlide(index: number, partial: Partial<Slide>) {
    const slides = [...presentation.slides];
    slides[index] = { ...slides[index], ...partial };
    update({ slides });
  }

  function addSlide() {
    const slides = [...presentation.slides, { title: '', body: '' }];
    update({ slides });
    setActiveSlide(slides.length - 1);
  }

  function removeSlide(index: number) {
    if (presentation.slides.length <= 1) return;
    const slides = presentation.slides.filter((_, i) => i !== index);
    update({ slides });
    if (activeSlide >= slides.length) setActiveSlide(slides.length - 1);
  }

  function moveSlide(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= presentation.slides.length) return;
    const slides = [...presentation.slides];
    [slides[index], slides[newIndex]] = [slides[newIndex], slides[index]];
    update({ slides });
    setActiveSlide(newIndex);
  }

  const currentSlide = presentation.slides[activeSlide] ?? { title: '', body: '' };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors">
            <ArrowLeft size={18} />
          </button>
          <input
            type="text"
            value={presentation.title}
            onChange={(e) => update({ title: e.target.value })}
            className="bg-transparent text-lg font-bold text-foreground border-none outline-none placeholder:text-foreground/30 min-w-0 flex-1"
            placeholder="Presentation title..."
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{saving ? 'Saving...' : 'Saved'}</span>
          <select
            value={presentation.status}
            onChange={(e) => update({ status: e.target.value as PresentationData['status'] })}
            className="rounded-lg border border-nativz-border bg-surface-hover px-3 py-1.5 text-xs text-foreground cursor-pointer"
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="archived">Archived</option>
          </select>
          <Button variant="ghost" size="sm" onClick={onSave}><Save size={14} /> Save</Button>
          <Button size="sm" onClick={onPresent}><Play size={14} /> Present</Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Slide list */}
        <div className="w-56 border-r border-nativz-border bg-background overflow-y-auto p-3 space-y-1.5">
          {presentation.slides.map((slide, i) => (
            <div
              key={i}
              onClick={() => setActiveSlide(i)}
              className={`group relative rounded-lg border p-2.5 cursor-pointer transition-all ${
                i === activeSlide
                  ? 'border-accent/40 bg-accent-surface/50 ring-1 ring-accent/20'
                  : 'border-nativz-border hover:border-white/15 hover:bg-surface-hover'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-bold text-text-muted mt-0.5">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-primary truncate">{slide.title || 'Untitled slide'}</p>
                  <p className="text-[10px] text-text-muted truncate mt-0.5">{slide.body?.substring(0, 60) || 'No content'}</p>
                </div>
              </div>
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                <button onClick={(e) => { e.stopPropagation(); moveSlide(i, -1); }} className="cursor-pointer rounded p-0.5 text-text-muted hover:text-foreground hover:bg-white/10 transition-colors" disabled={i === 0}><ChevronUp size={12} /></button>
                <button onClick={(e) => { e.stopPropagation(); moveSlide(i, 1); }} className="cursor-pointer rounded p-0.5 text-text-muted hover:text-foreground hover:bg-white/10 transition-colors" disabled={i === presentation.slides.length - 1}><ChevronDown size={12} /></button>
                <button onClick={(e) => { e.stopPropagation(); removeSlide(i); }} className="cursor-pointer rounded p-0.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors" disabled={presentation.slides.length <= 1}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
          <button onClick={addSlide} className="cursor-pointer w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 py-2.5 text-xs text-text-muted hover:text-accent-text hover:border-accent/40 transition-colors">
            <Plus size={12} /> Add slide
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <input type="text" value={currentSlide.title} onChange={(e) => updateSlide(activeSlide, { title: e.target.value })} className="w-full bg-transparent text-2xl font-bold text-foreground border-none outline-none placeholder:text-foreground/20" placeholder="Slide title..." />
          <div className="flex items-center gap-2">
            <Image size={14} className="text-text-muted shrink-0" />
            <input type="url" value={currentSlide.image_url ?? ''} onChange={(e) => updateSlide(activeSlide, { image_url: e.target.value || null })} className="flex-1 rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent/50 focus:outline-none transition-colors" placeholder="Image URL (optional)..." />
          </div>
          {currentSlide.image_url && (
            <div className="rounded-xl overflow-hidden border border-nativz-border bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentSlide.image_url} alt="" className="max-h-64 w-full object-contain" />
            </div>
          )}
          <textarea value={currentSlide.body} onChange={(e) => updateSlide(activeSlide, { body: e.target.value })} className="w-full min-h-[300px] rounded-xl border border-nativz-border bg-surface-hover p-4 text-sm text-foreground leading-relaxed placeholder:text-foreground/20 focus:border-accent/50 focus:outline-none resize-none transition-colors" placeholder="Slide content (supports markdown)..." />
          <div>
            <label className="text-xs text-text-muted font-medium mb-1 block">Speaker notes</label>
            <textarea value={currentSlide.notes ?? ''} onChange={(e) => updateSlide(activeSlide, { notes: e.target.value || null })} className="w-full min-h-[80px] rounded-lg border border-nativz-border bg-surface-hover p-3 text-xs text-foreground/70 placeholder:text-foreground/20 focus:border-accent/50 focus:outline-none resize-none transition-colors" placeholder="Notes for the presenter..." />
          </div>
        </div>

        {/* Meta panel */}
        <div className="w-64 border-l border-nativz-border bg-background overflow-y-auto p-4 space-y-5">
          <div>
            <label className="text-xs text-text-muted font-medium mb-2 block">Client</label>
            <ClientPickerButton clients={clients} value={presentation.client_id} onChange={(cid) => update({ client_id: cid })} placeholder="Assign to client" />
          </div>
          <div>
            <label className="text-xs text-text-muted font-medium mb-2 block">Description</label>
            <textarea value={presentation.description ?? ''} onChange={(e) => update({ description: e.target.value || null })} className="w-full min-h-[60px] rounded-lg border border-nativz-border bg-surface-hover p-2.5 text-xs text-foreground placeholder:text-foreground/30 focus:border-accent/50 focus:outline-none resize-none transition-colors" placeholder="Brief description..." />
          </div>
          <div className="pt-3 border-t border-nativz-border text-xs text-text-muted space-y-1">
            <div className="flex justify-between"><span>Slides</span><span className="text-text-secondary">{presentation.slides.length}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
