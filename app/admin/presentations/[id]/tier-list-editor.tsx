'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft, Plus, Trash2, Save, Link2, Pencil, Check, Settings2,
  ExternalLink, Type, ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker';
import { toast } from 'sonner';
import type { TierDef, TierItem, PresentationData } from './types';

// ─── Tier List Editor ────────────────────────────────────────────────────────

export function TierListEditor({
  presentation,
  saving,
  clients,
  update,
  onSave,
  onBack,
}: {
  presentation: PresentationData;
  saving: boolean;
  clients: ClientOption[];
  update: (partial: Partial<PresentationData>) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageTitleInput, setImageTitleInput] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [addMode, setAddMode] = useState<'url' | 'text' | 'image'>('url');
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOverTier, setDragOverTier] = useState<string | null>(null);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [showTierSettings, setShowTierSettings] = useState(false);

  const tiers = presentation.tiers ?? [];
  const items = presentation.tier_items ?? [];

  function updateTiers(newTiers: TierDef[]) { update({ tiers: newTiers }); }
  function updateItems(newItems: TierItem[]) { update({ tier_items: newItems }); }

  // ── Add item via URL ──
  async function handleAddUrl() {
    const url = urlInput.trim();
    if (!url) return;
    try { new URL(url); } catch { toast.error('Please enter a valid URL'); return; }

    setExtracting(true);
    try {
      const res = await fetch('/api/presentations/extract-thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const meta = res.ok ? await res.json() : { thumbnail_url: null, title: '' };
      updateItems([...items, {
        id: crypto.randomUUID(), url, title: meta.title || url,
        thumbnail_url: meta.thumbnail_url, tier_id: null, position: items.length,
      }]);
      setUrlInput('');
      toast.success('Item added');
    } catch { toast.error('Failed to extract thumbnail'); }
    finally { setExtracting(false); }
  }

  function handleAddText() {
    const text = textInput.trim();
    if (!text) return;
    updateItems([...items, {
      id: crypto.randomUUID(), url: '', title: text,
      thumbnail_url: null, tier_id: null, position: items.length,
    }]);
    setTextInput('');
  }

  function handleAddImage() {
    const imgUrl = imageUrlInput.trim();
    if (!imgUrl) return;
    try { new URL(imgUrl); } catch { toast.error('Please enter a valid image URL'); return; }
    updateItems([...items, {
      id: crypto.randomUUID(), url: '', title: imageTitleInput.trim() || 'Image',
      thumbnail_url: imgUrl, tier_id: null, position: items.length,
    }]);
    setImageUrlInput('');
    setImageTitleInput('');
  }

  // ── Drag and drop ──
  function handleDragStart(itemId: string) { setDragItem(itemId); }
  function handleDragOver(e: React.DragEvent, tierId: string | null) { e.preventDefault(); setDragOverTier(tierId); }
  function handleDrop(tierId: string | null) {
    if (!dragItem) return;
    updateItems(items.map((i) => i.id === dragItem ? { ...i, tier_id: tierId } : i));
    setDragItem(null); setDragOverTier(null);
  }
  function handleDragEnd() { setDragItem(null); setDragOverTier(null); }

  // ── Tier management ──
  function addTier() {
    updateTiers([...tiers, { id: crypto.randomUUID(), name: `Tier ${tiers.length + 1}`, color: '#888888' }]);
  }
  function updateTierDef(tierId: string, partial: Partial<TierDef>) {
    updateTiers(tiers.map((t) => t.id === tierId ? { ...t, ...partial } : t));
  }
  function removeTier(tierId: string) {
    updateItems(items.map((i) => i.tier_id === tierId ? { ...i, tier_id: null } : i));
    updateTiers(tiers.filter((t) => t.id !== tierId));
  }
  function moveTier(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tiers.length) return;
    const next = [...tiers];
    [next[index], next[newIndex]] = [next[newIndex], next[index]];
    updateTiers(next);
  }
  function updateItem(itemId: string, partial: Partial<TierItem>) {
    updateItems(items.map((i) => i.id === itemId ? { ...i, ...partial } : i));
  }
  function removeItem(itemId: string) { updateItems(items.filter((i) => i.id !== itemId)); }

  function getItemsForTier(tierId: string | null) { return items.filter((i) => i.tier_id === tierId); }
  const unranked = getItemsForTier(null);

  // ── Card dimensions ──
  const CARD_W = 120;
  const CARD_VH = 68;
  const CARD_TH = 22;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors"><ArrowLeft size={18} /></button>
          <input type="text" value={presentation.title} onChange={(e) => update({ title: e.target.value })} className="bg-transparent text-lg font-bold text-foreground border-none outline-none placeholder:text-foreground/30 min-w-0 flex-1" placeholder="Tier list title..." />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{saving ? 'Saving...' : 'Saved'}</span>
          <button onClick={() => setShowTierSettings(!showTierSettings)} className={`cursor-pointer rounded-lg p-2 text-text-muted hover:bg-surface-hover transition-colors ${showTierSettings ? 'bg-surface-hover text-accent-text' : ''}`} title="Tier settings"><Settings2 size={16} /></button>
          <Button variant="ghost" size="sm" onClick={onSave}><Save size={14} /> Save</Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {/* Tier rows */}
          {tiers.map((tier) => {
            const tierItems = getItemsForTier(tier.id);
            const isDragOver = dragOverTier === tier.id;
            return (
              <div key={tier.id} className={`flex rounded-xl border transition-all ${isDragOver ? 'border-accent/50 ring-1 ring-accent/20 bg-accent-surface/20' : 'border-nativz-border bg-surface'}`} onDragOver={(e) => handleDragOver(e, tier.id)} onDrop={() => handleDrop(tier.id)}>
                <div className="w-20 shrink-0 flex flex-col items-center justify-center rounded-l-xl px-2 py-3" style={{ backgroundColor: tier.color + '30' }}>
                  {editingTier === tier.id ? (
                    <input type="text" value={tier.name} onChange={(e) => updateTierDef(tier.id, { name: e.target.value })} onBlur={() => setEditingTier(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingTier(null)} autoFocus className="w-full bg-transparent text-center text-sm font-bold outline-none" style={{ color: tier.color }} />
                  ) : (
                    <button onClick={() => setEditingTier(tier.id)} className="cursor-pointer text-sm font-bold hover:opacity-70 transition-opacity" style={{ color: tier.color }}>{tier.name}</button>
                  )}
                </div>
                <div className="flex-1 flex flex-wrap items-center gap-2 p-2 min-h-[64px]">
                  {tierItems.length === 0 && !isDragOver && <span className="text-xs text-text-muted/50 px-2">Drop items here</span>}
                  {tierItems.map((item) => (
                    <TierItemCard key={item.id} item={item} cardW={CARD_W} cardVH={CARD_VH} cardTH={CARD_TH} isEditing={editingItem === item.id} onEdit={() => setEditingItem(editingItem === item.id ? null : item.id)} onUpdate={(p) => updateItem(item.id, p)} onRemove={() => removeItem(item.id)} onDragStart={() => handleDragStart(item.id)} onDragEnd={handleDragEnd} isDragging={dragItem === item.id} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Unranked */}
          <div className={`rounded-xl border-2 border-dashed transition-all ${dragOverTier === '__unranked' ? 'border-white/30 bg-surface-hover' : 'border-nativz-border'}`} onDragOver={(e) => handleDragOver(e, '__unranked')} onDrop={() => handleDrop(null)}>
            <div className="px-4 py-2 border-b border-nativz-border"><span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Unranked</span></div>
            <div className="flex flex-wrap items-center gap-2 p-3 min-h-[64px]">
              {unranked.length === 0 && <span className="text-xs text-text-muted/50">Add items below, then drag them into tiers</span>}
              {unranked.map((item) => (
                <TierItemCard key={item.id} item={item} cardW={CARD_W} cardVH={CARD_VH} cardTH={CARD_TH} isEditing={editingItem === item.id} onEdit={() => setEditingItem(editingItem === item.id ? null : item.id)} onUpdate={(p) => updateItem(item.id, p)} onRemove={() => removeItem(item.id)} onDragStart={() => handleDragStart(item.id)} onDragEnd={handleDragEnd} isDragging={dragItem === item.id} />
              ))}
            </div>
          </div>

          {/* Add item */}
          <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
            <div className="flex gap-1 rounded-lg bg-surface-hover p-0.5 w-fit">
              {(['url', 'image', 'text'] as const).map((mode) => (
                <button key={mode} onClick={() => setAddMode(mode)} className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${addMode === mode ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:text-foreground'}`}>
                  <span className="flex items-center gap-1.5">
                    {mode === 'url' && <><Link2 size={12} /> URL</>}
                    {mode === 'image' && <><ImageIcon size={12} /> Image</>}
                    {mode === 'text' && <><Type size={12} /> Text</>}
                  </span>
                </button>
              ))}
            </div>

            {addMode === 'url' && (
              <form onSubmit={(e) => { e.preventDefault(); handleAddUrl(); }} className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="Paste a video or content URL..." className="w-full rounded-lg border border-nativz-border bg-surface-hover py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors" />
                </div>
                <Button type="submit" disabled={extracting || !urlInput.trim()}>
                  {extracting ? <><div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Extracting...</> : <><Plus size={14} /> Add item</>}
                </Button>
              </form>
            )}

            {addMode === 'image' && (
              <form onSubmit={(e) => { e.preventDefault(); handleAddImage(); }} className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ImageIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input type="url" value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} placeholder="Paste an image URL..." className="w-full rounded-lg border border-nativz-border bg-surface-hover py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors" />
                  </div>
                  <Button type="submit" disabled={!imageUrlInput.trim()}><Plus size={14} /> Add image</Button>
                </div>
                <input type="text" value={imageTitleInput} onChange={(e) => setImageTitleInput(e.target.value)} placeholder="Title (optional)..." className="w-full rounded-lg border border-nativz-border bg-surface-hover py-2 px-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors" />
              </form>
            )}

            {addMode === 'text' && (
              <form onSubmit={(e) => { e.preventDefault(); handleAddText(); }} className="flex gap-2">
                <div className="relative flex-1">
                  <Type size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Type a label or description..." className="w-full rounded-lg border border-nativz-border bg-surface-hover py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors" />
                </div>
                <Button type="submit" disabled={!textInput.trim()}><Plus size={14} /> Add text</Button>
              </form>
            )}
          </div>
        </div>

        {/* Settings panel */}
        {showTierSettings && (
          <div className="w-72 border-l border-nativz-border bg-background overflow-y-auto p-4 space-y-5">
            <div>
              <label className="text-xs text-text-muted font-medium mb-2 block">Client</label>
              <ClientPickerButton clients={clients} value={presentation.client_id} onChange={(cid) => update({ client_id: cid })} placeholder="Assign to client" />
            </div>
            <div>
              <label className="text-xs text-text-muted font-medium mb-2 block">Description</label>
              <textarea value={presentation.description ?? ''} onChange={(e) => update({ description: e.target.value || null })} className="w-full min-h-[60px] rounded-lg border border-nativz-border bg-surface-hover p-2.5 text-xs text-foreground placeholder:text-foreground/30 focus:border-accent/50 focus:outline-none resize-none transition-colors" placeholder="Brief description..." />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-text-muted font-medium">Tiers</label>
                <button onClick={addTier} className="cursor-pointer flex items-center gap-1 text-[10px] text-accent-text hover:text-accent-text/80 transition-colors"><Plus size={10} /> Add tier</button>
              </div>
              <div className="space-y-1.5">
                {tiers.map((tier, i) => (
                  <div key={tier.id} className="flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-2 py-1.5">
                    <input type="color" value={tier.color} onChange={(e) => updateTierDef(tier.id, { color: e.target.value })} className="h-5 w-5 rounded border-0 cursor-pointer bg-transparent shrink-0" />
                    <input type="text" value={tier.name} onChange={(e) => updateTierDef(tier.id, { name: e.target.value })} className="flex-1 bg-transparent text-xs text-foreground outline-none min-w-0" />
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => moveTier(i, -1)} disabled={i === 0} className="cursor-pointer rounded p-0.5 text-text-muted hover:text-foreground hover:bg-white/10 transition-colors disabled:opacity-30"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg></button>
                      <button onClick={() => moveTier(i, 1)} disabled={i === tiers.length - 1} className="cursor-pointer rounded p-0.5 text-text-muted hover:text-foreground hover:bg-white/10 transition-colors disabled:opacity-30"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
                      <button onClick={() => removeTier(tier.id)} className="cursor-pointer rounded p-0.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={10} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-3 border-t border-nativz-border text-xs text-text-muted space-y-1">
              <div className="flex justify-between"><span>Tiers</span><span className="text-text-secondary">{tiers.length}</span></div>
              <div className="flex justify-between"><span>Items</span><span className="text-text-secondary">{items.length}</span></div>
              <div className="flex justify-between"><span>Ranked</span><span className="text-text-secondary">{items.filter((i) => i.tier_id).length}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tier item card — consistent size for URL / image / text ─────────────────

function TierItemCard({
  item, cardW, cardVH, cardTH, isEditing, onEdit, onUpdate, onRemove, onDragStart, onDragEnd, isDragging,
}: {
  item: TierItem;
  cardW: number;
  cardVH: number;
  cardTH: number;
  isEditing: boolean;
  onEdit: () => void;
  onUpdate: (partial: Partial<TierItem>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const [editTitle, setEditTitle] = useState(item.title);
  const hasUrl = !!item.url;
  const hasImage = !!item.thumbnail_url;
  const isTextOnly = !hasUrl && !hasImage;

  useEffect(() => { setEditTitle(item.title); }, [item.title]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group/item relative rounded-lg border border-nativz-border bg-background overflow-hidden transition-all cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40 scale-95' : 'hover:border-white/20'}`}
      style={{ width: cardW }}
    >
      {/* Visual area — same height for all types */}
      <div className="overflow-hidden bg-surface-hover" style={{ height: cardVH }}>
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnail_url!} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : isTextOnly ? (
          <div className="w-full h-full flex items-center justify-center px-2">
            <p className="text-xs text-text-primary font-medium text-center leading-snug line-clamp-3">{item.title}</p>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted/30"><Link2 size={16} /></div>
        )}
      </div>

      {/* Title strip */}
      <div className="px-1.5 flex items-center" style={{ height: cardTH }}>
        {isEditing ? (
          <div className="flex items-center gap-0.5 w-full">
            <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { onUpdate({ title: editTitle }); onEdit(); } if (e.key === 'Escape') onEdit(); }} autoFocus className="flex-1 bg-transparent text-[10px] text-foreground outline-none min-w-0" />
            <button onClick={() => { onUpdate({ title: editTitle }); onEdit(); }} className="cursor-pointer text-accent-text shrink-0"><Check size={10} /></button>
          </div>
        ) : (
          <p className="text-[10px] text-text-secondary truncate leading-tight w-full">{item.title}</p>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute top-0.5 right-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center gap-0.5">
        {hasUrl && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="rounded p-0.5 bg-black/60 text-foreground/70 hover:text-foreground transition-colors" onClick={(e) => e.stopPropagation()}><ExternalLink size={10} /></a>
        )}
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="cursor-pointer rounded p-0.5 bg-black/60 text-foreground/70 hover:text-foreground transition-colors"><Pencil size={10} /></button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="cursor-pointer rounded p-0.5 bg-black/60 text-foreground/70 hover:text-red-400 transition-colors"><Trash2 size={10} /></button>
      </div>
    </div>
  );
}
