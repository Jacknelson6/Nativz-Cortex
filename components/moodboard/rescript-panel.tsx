'use client';

import { useState, useEffect } from 'react';
// modal is built inline, no Dialog import needed
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Copy, Loader2, FileText, Check, Hash, Target, Lightbulb, Clapperboard, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { MoodboardItem, RescriptData } from '@/lib/types/moodboard';

interface RescriptPanelProps {
  item: MoodboardItem;
  onClose: () => void;
  onSaved: (rescript: RescriptData) => void;
}

interface ClientOption {
  id: string;
  name: string;
  industry: string;
}

export function RescriptPanel({ item, onClose, onSaved }: RescriptPanelProps) {
  const [step, setStep] = useState<'configure' | 'generating' | 'result'>('configure');
  const [clientId, setClientId] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [product, setProduct] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [rescript, setRescript] = useState<RescriptData | null>(item.rescript || null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (item.rescript) {
      setRescript(item.rescript);
      setStep('result');
    }
  }, [item.rescript]);

  useEffect(() => {
    async function fetchClients() {
      const supabase = createClient();
      const { data } = await supabase
        .from('clients')
        .select('id, name, industry')
        .eq('is_active', true)
        .order('name');
      if (data) setClients(data);
    }
    fetchClients();
  }, []);

  async function handleGenerate() {
    setStep('generating');
    try {
      const res = await fetch(`/api/moodboard/items/${item.id}/rescript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId || undefined,
          brand_voice: brandVoice.trim() || undefined,
          product: product.trim() || undefined,
          target_audience: targetAudience.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate rescript');
      }

      const data = await res.json();
      setRescript(data.rescript);
      onSaved(data.rescript);
      setStep('result');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
      setStep('configure');
    }
  }

  function handleCopyScript() {
    if (!rescript?.adapted_script) return;
    navigator.clipboard.writeText(rescript.adapted_script);
    setCopied(true);
    toast.success('Script copied!');
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleExportPDF() {
    if (!rescript) return;
    // Build a printable HTML and open in new window for PDF
    const html = `
      <html><head><title>Rescript - ${item.title || 'Video'}</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; color: #222; line-height: 1.6; }
        h1 { color: #6366f1; } h2 { color: #7c3aed; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
        .shot { background: #f9fafb; padding: 12px; margin: 8px 0; border-radius: 8px; border-left: 3px solid #6366f1; }
        .hook { background: #faf5ff; padding: 12px; margin: 8px 0; border-radius: 8px; }
        .tag { display: inline-block; background: #ede9fe; color: #6366f1; padding: 2px 10px; border-radius: 12px; margin: 4px; font-size: 14px; }
      </style></head><body>
      <h1>✍️ Rescript: ${item.title || 'Video'}</h1>
      <h2>Adapted Script</h2><pre style="white-space:pre-wrap">${rescript.adapted_script}</pre>
      <h2>Shot List</h2>${rescript.shot_list.map(s => `<div class="shot"><strong>#${s.number}</strong> [${s.timing}] ${s.description}${s.notes ? ` — <em>${s.notes}</em>` : ''}</div>`).join('')}
      <h2>Hook Alternatives</h2>${rescript.hook_alternatives.map((h, i) => `<div class="hook"><strong>Option ${i + 1}:</strong> ${h}</div>`).join('')}
      <h2>Hashtags</h2><div>${rescript.hashtags.map(t => `<span class="tag">#${t}</span>`).join('')}</div>
      <h2>Posting Strategy</h2><p>${rescript.posting_strategy}</p>
      </body></html>
    `;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-nativz-border bg-surface shadow-2xl p-6" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 p-2">
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-text-primary">Rescript / Adapt</h2>
                <p className="text-xs text-text-muted">{item.title || 'Video'}</p>
              </div>
            </div>
            <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors">✕</button>
          </div>

          {/* Configure Step */}
          {step === 'configure' && (
            <div className="space-y-4">
              {/* Client Picker */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Client (optional)</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">No client — generic rescript</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.industry})</option>
                  ))}
                </select>
              </div>

              {/* Brand Voice */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Brand Voice</label>
                <textarea
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value)}
                  placeholder="e.g., Witty, confident, Gen-Z friendly. Uses slang but stays professional."
                  className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none h-20"
                />
              </div>

              {/* Product */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Product / Service</label>
                <input
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="e.g., Protein shake, SaaS tool, Skincare line"
                  className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Target Audience</label>
                <input
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g., 18-25 women interested in fitness"
                  className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <GlassButton onClick={handleGenerate} className="w-full justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white">
                <Sparkles size={16} />
                Generate Rescript
              </GlassButton>
            </div>
          )}

          {/* Generating Step */}
          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 blur-lg opacity-50 animate-pulse" />
                <div className="relative rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 p-4">
                  <Loader2 size={24} className="text-white animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-text-primary">Rescripting for your brand...</p>
                <p className="text-xs text-text-muted mt-1">Adapting hook, script, and strategy</p>
              </div>
              <div className="flex gap-1 mt-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          {/* Result Step */}
          {step === 'result' && rescript && (
            <div className="space-y-5">
              {/* Action buttons */}
              <div className="flex gap-2">
                <Button onClick={handleCopyScript} variant="outline" size="sm" className="gap-1.5 text-xs">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy Script'}
                </Button>
                <Button onClick={handleExportPDF} variant="outline" size="sm" className="gap-1.5 text-xs">
                  <FileText size={14} />
                  Export PDF
                </Button>
                <Button onClick={() => { setRescript(null); setStep('configure'); }} variant="outline" size="sm" className="gap-1.5 text-xs ml-auto">
                  <Sparkles size={14} />
                  Regenerate
                </Button>
              </div>

              {/* Adapted Script */}
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-2">
                  <Clapperboard size={14} className="text-indigo-400" />
                  Adapted Script
                </h3>
                <div className="rounded-xl border border-nativz-border bg-surface-hover p-4 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {rescript.adapted_script}
                </div>
              </section>

              {/* Shot List */}
              {rescript.shot_list.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-2">
                    <Target size={14} className="text-purple-400" />
                    Shot List
                  </h3>
                  <div className="space-y-2">
                    {rescript.shot_list.map((shot, i) => (
                      <div key={i} className="flex gap-3 rounded-lg border border-nativz-border bg-surface-hover p-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                          {shot.number}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">{shot.timing}</span>
                          </div>
                          <p className="text-sm text-text-secondary">{shot.description}</p>
                          {shot.notes && <p className="text-xs text-text-muted mt-1 italic">{shot.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Hook Alternatives */}
              {rescript.hook_alternatives.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-2">
                    <Lightbulb size={14} className="text-yellow-400" />
                    Hook Alternatives
                  </h3>
                  <div className="grid gap-2">
                    {rescript.hook_alternatives.map((hook, i) => (
                      <div key={i} className="rounded-xl border border-nativz-border bg-gradient-to-r from-indigo-500/5 to-purple-600/5 p-3">
                        <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Option {i + 1}</span>
                        <p className="text-sm text-text-secondary mt-1">{hook}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Hashtags */}
              {rescript.hashtags.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-2">
                    <Hash size={14} className="text-blue-400" />
                    Hashtags
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {rescript.hashtags.map((tag, i) => (
                      <span key={i} className="rounded-full bg-accent/10 text-accent px-3 py-1 text-xs font-medium">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Posting Strategy */}
              {rescript.posting_strategy && (
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-2">
                    <Target size={14} className="text-green-400" />
                    Posting Strategy
                  </h3>
                  <div className="rounded-xl border border-nativz-border bg-surface-hover p-4 text-sm text-text-secondary whitespace-pre-wrap">
                    {rescript.posting_strategy}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
