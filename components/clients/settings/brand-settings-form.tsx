'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save, Loader2, Pencil, X, Sparkles, DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { ProfileField } from '@/components/clients/client-profile-fields';

type BrandPayload = {
  id: string;
  name: string;
  website_url: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  topic_keywords: string[] | null;
  description: string | null;
  services: string[] | null;
  monthly_boosting_budget: number | null;
};

export function BrandSettingsForm({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<BrandPayload | null>(null);

  const [targetAudience, setTargetAudience] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [topicKeywords, setTopicKeywords] = useState('');
  const [description, setDescription] = useState('');
  const [boostingBudget, setBoostingBudget] = useState('');

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as { error?: string }).error || 'Failed to load client');
        }
        const d = (await res.json()) as { client: BrandPayload };
        if (cancelled) return;
        const c = d.client;
        setClient(c);
        setTargetAudience(c.target_audience ?? '');
        setBrandVoice(c.brand_voice ?? '');
        setTopicKeywords((c.topic_keywords ?? []).join(', '));
        setDescription(c.description ?? '');
        setBoostingBudget(c.monthly_boosting_budget != null ? String(c.monthly_boosting_budget) : '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleGenerateAI() {
    if (!client?.website_url) {
      toast.error('Set a website URL first (in General).');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch('/api/clients/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: client.website_url }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to analyze website');
        return;
      }
      const data = await res.json();
      if (data.target_audience) setTargetAudience(data.target_audience);
      if (data.brand_voice) setBrandVoice(data.brand_voice);
      if (data.topic_keywords) setTopicKeywords(data.topic_keywords.join(', '));
      toast.success('Fields generated from website.');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_audience: targetAudience || null,
          brand_voice: brandVoice || null,
          topic_keywords: topicKeywords.split(',').map((k) => k.trim()).filter(Boolean),
          description: description.trim() || null,
          monthly_boosting_budget: boostingBudget.trim() ? Number(boostingBudget.trim()) : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to save');
        return;
      }
      toast.success('Brand profile saved');
      setEditing(false);
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <div className="flex min-h-[20vh] items-center justify-center p-6 text-sm text-red-400">{error}</div>;
  }

  if (loading || !client) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center p-6">
        <Loader2 size={20} className="animate-spin text-accent-text" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} noValidate className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Brand profile</h2>
          <p className="text-sm text-text-muted mt-0.5">
            Audience, voice, keywords — the context every AI flow in Cortex uses for this client.
          </p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => {
              setTargetAudience(client.target_audience ?? '');
              setBrandVoice(client.brand_voice ?? '');
              setTopicKeywords((client.topic_keywords ?? []).join(', '));
              setDescription(client.description ?? '');
              setBoostingBudget(client.monthly_boosting_budget != null ? String(client.monthly_boosting_budget) : '');
              setEditing(false);
            }}>
              <X size={14} />
              Cancel
            </Button>
            {client.website_url && (
              <Button type="button" variant="outline" size="sm" onClick={handleGenerateAI} disabled={analyzing}>
                {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {analyzing ? 'Analyzing…' : 'Generate with AI'}
              </Button>
            )}
            <Button type="submit" size="sm" disabled={saving}>
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            Edit
          </Button>
        )}
      </div>

      <Card>
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Textarea
                id="target_audience"
                label="Target audience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="Describe the target audience…"
                rows={3}
              />
              <Textarea
                id="brand_voice"
                label="Brand voice"
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                placeholder="Describe the brand voice and tone…"
                rows={3}
              />
            </div>
            <Input
              id="topic_keywords"
              label="Topic keywords (comma-separated)"
              value={topicKeywords}
              onChange={(e) => setTopicKeywords(e.target.value)}
              placeholder="fitness, nutrition, wellness"
            />
            <Textarea
              id="description"
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional: long-form description of the brand…"
              rows={3}
            />
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Boosting budget</label>
              <div className="relative max-w-xs">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={boostingBudget}
                  onChange={(e) => setBoostingBudget(e.target.value)}
                  placeholder="e.g. 500"
                  className="block w-full rounded-lg border border-nativz-border bg-surface pl-8 pr-3 py-2 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <p className="text-xs text-text-muted mt-1">Monthly. Used for reporting + recommendations.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ProfileField label="Target audience" value={client.target_audience ?? ''} />
              <ProfileField label="Brand voice" value={client.brand_voice ?? ''} />
            </div>
            <ProfileField label="Topic keywords" value={(client.topic_keywords ?? []).join(', ')} />
            <ProfileField label="Description" value={client.description ?? ''} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="block text-xs font-medium text-text-muted mb-1.5">Services</span>
                {(client.services ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(client.services ?? []).map((svc) => (
                      <Badge key={svc} variant="default">
                        {svc}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted italic">Not set</p>
                )}
              </div>
              <ProfileField
                label="Boosting budget"
                value={client.monthly_boosting_budget ? `$${client.monthly_boosting_budget.toLocaleString()}/mo` : ''}
              />
            </div>
          </div>
        )}
      </Card>
    </form>
  );
}
