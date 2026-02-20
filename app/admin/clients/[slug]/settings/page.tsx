'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { ImageUpload } from '@/components/ui/image-upload';
import { TagInput } from '@/components/ui/tag-input';
import { GlowButton } from '@/components/ui/glow-button';
import type { ClientPreferences } from '@/lib/types/database';

interface ClientData {
  id: string | null;
  name: string;
  slug: string;
  industry: string;
  target_audience: string | null;
  brand_voice: string | null;
  topic_keywords: string[] | null;
  logo_url: string | null;
  website_url: string | null;
  preferences: ClientPreferences | null;
  feature_flags: {
    can_search: boolean;
    can_view_reports: boolean;
    can_edit_preferences: boolean;
    can_submit_ideas: boolean;
  } | null;
  is_active: boolean;
  source: 'supabase' | 'vault';
}

export default function AdminClientSettingsPage() {
  const params = useParams<{ slug: string }>();
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Form state
  const [industry, setIndustry] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [topicKeywords, setTopicKeywords] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [canSearch, setCanSearch] = useState(true);
  const [canViewReports, setCanViewReports] = useState(true);
  const [canEditPreferences, setCanEditPreferences] = useState(false);
  const [canSubmitIdeas, setCanSubmitIdeas] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Preferences
  const [toneKeywords, setToneKeywords] = useState<string[]>([]);
  const [topicsLeanInto, setTopicsLeanInto] = useState<string[]>([]);
  const [topicsAvoid, setTopicsAvoid] = useState<string[]>([]);
  const [competitorAccounts, setCompetitorAccounts] = useState<string[]>([]);
  const [seasonalPriorities, setSeasonalPriorities] = useState<string[]>([]);

  useEffect(() => {
    async function fetchClient() {
      const supabase = createClient();

      // Try Supabase first
      const { data } = await supabase
        .from('clients')
        .select('id, name, slug, industry, target_audience, brand_voice, topic_keywords, feature_flags, is_active, logo_url, website_url, preferences')
        .eq('slug', params.slug)
        .single();

      if (data) {
        const clientData: ClientData = { ...data, source: 'supabase' } as ClientData;
        setClient(clientData);
        setIndustry(data.industry || '');
        setTargetAudience(data.target_audience || '');
        setBrandVoice(data.brand_voice || '');
        setTopicKeywords((data.topic_keywords || []).join(', '));
        setLogoUrl(data.logo_url || null);
        setWebsiteUrl(data.website_url || '');
        const flags = data.feature_flags as ClientData['feature_flags'];
        setCanSearch(flags?.can_search ?? true);
        setCanViewReports(flags?.can_view_reports ?? true);
        setCanEditPreferences(flags?.can_edit_preferences ?? false);
        setCanSubmitIdeas(flags?.can_submit_ideas ?? false);
        setIsActive(data.is_active);
        const p = data.preferences as ClientPreferences | null;
        if (p) {
          setToneKeywords(p.tone_keywords || []);
          setTopicsLeanInto(p.topics_lean_into || []);
          setTopicsAvoid(p.topics_avoid || []);
          setCompetitorAccounts(p.competitor_accounts || []);
          setSeasonalPriorities(p.seasonal_priorities || []);
        }
      } else {
        // Fallback: try vault data via API
        try {
          const res = await fetch(`/api/clients/vault/${params.slug}`);
          if (res.ok) {
            const vaultData = await res.json();
            setClient({
              id: null,
              name: vaultData.name,
              slug: vaultData.slug,
              industry: vaultData.industry || 'General',
              target_audience: vaultData.target_audience || null,
              brand_voice: vaultData.brand_voice || null,
              topic_keywords: vaultData.topic_keywords || null,
              logo_url: null,
              website_url: vaultData.website_url || null,
              preferences: null,
              feature_flags: null,
              is_active: true,
              source: 'vault',
            });
            setIndustry(vaultData.industry || 'General');
            setTargetAudience(vaultData.target_audience || '');
            setBrandVoice(vaultData.brand_voice || '');
            setTopicKeywords((vaultData.topic_keywords || []).join(', '));
            setWebsiteUrl(vaultData.website_url || '');
          }
        } catch {
          // Vault also failed
        }
      }
      setLoading(false);
    }
    fetchClient();
  }, [params.slug]);

  async function handleGenerateAI() {
    const url = websiteUrl.trim();
    if (!url) {
      toast.error('Enter a website URL first.');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch('/api/clients/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to analyze website.');
        return;
      }
      const data = await res.json();
      if (data.industry) setIndustry(data.industry);
      if (data.target_audience) setTargetAudience(data.target_audience);
      if (data.brand_voice) setBrandVoice(data.brand_voice);
      if (data.topic_keywords) setTopicKeywords(data.topic_keywords.join(', '));
      if (data.logo_url && !logoUrl) setLogoUrl(data.logo_url);
      toast.success('Fields generated from website.');
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setSaving(true);

    try {
      const payload = {
        industry,
        target_audience: targetAudience || null,
        brand_voice: brandVoice || null,
        topic_keywords: topicKeywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        logo_url: logoUrl || null,
        website_url: websiteUrl.trim() || null,
        feature_flags: {
          can_search: canSearch,
          can_view_reports: canViewReports,
          can_edit_preferences: canEditPreferences,
          can_submit_ideas: canSubmitIdeas,
        },
        preferences: {
          tone_keywords: toneKeywords,
          topics_lean_into: topicsLeanInto,
          topics_avoid: topicsAvoid,
          competitor_accounts: competitorAccounts,
          seasonal_priorities: seasonalPriorities,
        },
        is_active: isActive,
      };

      if (client.source === 'vault' && !client.id) {
        // Create Supabase record first for vault-only clients
        const createRes = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: client.name,
            slug: client.slug,
            ...payload,
          }),
        });

        if (!createRes.ok) {
          const data = await createRes.json();
          toast.error(data.error || 'Failed to create client record.');
          return;
        }

        const created = await createRes.json();
        setClient({ ...client, id: created.id, source: 'supabase' });
        toast.success('Client record created and settings saved.');
      } else if (client.id) {
        const res = await fetch(`/api/clients/${client.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || 'Failed to save settings.');
        } else {
          toast.success('Settings saved.');
        }
      }
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-text-muted">Loading...</div>;
  }

  if (!client) {
    return <div className="p-6 text-sm text-red-400">Client not found.</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <form onSubmit={handleSave} className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/admin/clients/${params.slug}`} className="text-text-muted hover:text-text-secondary transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-text-primary">{client.name}</h1>
            <p className="text-sm text-text-muted">Settings</p>
          </div>
          {websiteUrl.trim() && (
            <GlowButton
              onClick={handleGenerateAI}
              disabled={analyzing}
              loading={analyzing}
            >
              {!analyzing && <Sparkles size={14} />}
              {analyzing ? 'Analyzing...' : 'Generate with AI'}
            </GlowButton>
          )}
          <Button type="submit" disabled={saving} size="sm">
            <Save size={14} />
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
        </div>

        {/* Vault-only notice */}
        {client.source === 'vault' && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            This client exists in the vault but not yet in Cortex. Saving will create the database record.
          </div>
        )}

        {/* Row 1: Logo + Business info */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
          <Card className="lg:w-56">
            <h2 className="text-base font-semibold text-text-primary mb-4">Logo</h2>
            <ImageUpload value={logoUrl} onChange={setLogoUrl} size="lg" />
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-text-primary mb-4">Business info</h2>
            <div className="space-y-4">
              <Input
                id="website_url"
                label="Website URL"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  id="industry"
                  label="Industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  required
                />
                <Input
                  id="topic_keywords"
                  label="Topic keywords (comma-separated)"
                  value={topicKeywords}
                  onChange={(e) => setTopicKeywords(e.target.value)}
                  placeholder="fitness, nutrition, wellness"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Textarea
                  id="target_audience"
                  label="Target audience"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Describe the target audience..."
                  rows={3}
                />
                <Textarea
                  id="brand_voice"
                  label="Brand voice"
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value)}
                  placeholder="Describe the brand voice and tone..."
                  rows={3}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Row 2: Brand preferences + Portal access */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="text-base font-semibold text-text-primary mb-1">Brand preferences</h2>
            <p className="text-sm text-text-muted mb-4">These guide AI content recommendations.</p>
            <div className="space-y-4">
              <TagInput
                id="tone_keywords"
                label="Tone keywords"
                value={toneKeywords}
                onChange={setToneKeywords}
                placeholder="e.g., bold, playful, authoritative"
              />
              <TagInput
                id="topics_lean_into"
                label="Topics to lean into"
                value={topicsLeanInto}
                onChange={setTopicsLeanInto}
                placeholder="e.g., sustainable fashion, behind the scenes"
              />
              <TagInput
                id="topics_avoid"
                label="Topics to avoid"
                value={topicsAvoid}
                onChange={setTopicsAvoid}
                placeholder="e.g., politics, competitor drama"
              />
              <TagInput
                id="competitor_accounts"
                label="Competitors they admire"
                value={competitorAccounts}
                onChange={setCompetitorAccounts}
                placeholder="e.g., @nike, @glossier"
              />
              <TagInput
                id="seasonal_priorities"
                label="Seasonal priorities"
                value={seasonalPriorities}
                onChange={setSeasonalPriorities}
                placeholder="e.g., Summer 2026 launch"
              />
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-text-primary mb-4">Portal access</h2>
            <div className="space-y-4">
              <Toggle
                checked={canSearch}
                onChange={setCanSearch}
                label="Can run topic searches"
                description="Allow this client's portal users to run new searches"
              />
              <Toggle
                checked={canViewReports}
                onChange={setCanViewReports}
                label="Can view approved reports"
                description="Show approved reports in the client portal"
              />
              <Toggle
                checked={canEditPreferences}
                onChange={setCanEditPreferences}
                label="Can edit brand preferences"
                description="Allow portal users to update tone, topics, and seasonal priorities"
              />
              <Toggle
                checked={canSubmitIdeas}
                onChange={setCanSubmitIdeas}
                label="Can submit ideas"
                description="Allow portal users to submit content ideas and requests"
              />
              <Toggle
                checked={isActive}
                onChange={setIsActive}
                label="Client is active"
                description="Inactive clients are hidden from the portal"
              />
            </div>
          </Card>
        </div>

      </form>
    </div>
  );
}
