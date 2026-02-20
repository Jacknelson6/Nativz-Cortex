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

interface ClientData {
  id: string;
  name: string;
  slug: string;
  industry: string;
  target_audience: string | null;
  brand_voice: string | null;
  topic_keywords: string[] | null;
  logo_url: string | null;
  website_url: string | null;
  feature_flags: {
    can_search: boolean;
    can_view_reports: boolean;
  } | null;
  is_active: boolean;
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
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    async function fetchClient() {
      const supabase = createClient();
      const { data } = await supabase
        .from('clients')
        .select('id, name, slug, industry, target_audience, brand_voice, topic_keywords, feature_flags, is_active, logo_url, website_url')
        .eq('slug', params.slug)
        .single();

      if (data) {
        setClient(data as ClientData);
        setIndustry(data.industry || '');
        setTargetAudience(data.target_audience || '');
        setBrandVoice(data.brand_voice || '');
        setTopicKeywords((data.topic_keywords || []).join(', '));
        setLogoUrl(data.logo_url || null);
        setWebsiteUrl(data.website_url || '');
        const flags = data.feature_flags as ClientData['feature_flags'];
        setCanSearch(flags?.can_search ?? true);
        setCanViewReports(flags?.can_view_reports ?? true);
        setIsActive(data.is_active);
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
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry,
          target_audience: targetAudience || null,
          brand_voice: brandVoice || null,
          topic_keywords: topicKeywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
          logo_url: logoUrl || null,
          website_url: websiteUrl.trim() || null,
          feature_flags: { can_search: canSearch, can_view_reports: canViewReports },
          is_active: isActive,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to save settings.');
      } else {
        toast.success('Settings saved.');
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
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/admin/clients/${params.slug}`} className="text-text-muted hover:text-text-secondary transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{client.name}</h1>
          <p className="text-sm text-text-muted">Settings</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile image */}
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Logo</h2>
          <ImageUpload value={logoUrl} onChange={setLogoUrl} size="lg" />
        </Card>

        {/* Business info */}
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
            {websiteUrl.trim() && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleGenerateAI}
                disabled={analyzing}
              >
                <Sparkles size={14} />
                {analyzing ? 'Analyzing website...' : 'Generate fields with AI'}
              </Button>
            )}
            <Input
              id="industry"
              label="Industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              required
            />
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
            <Input
              id="topic_keywords"
              label="Topic keywords (comma-separated)"
              value={topicKeywords}
              onChange={(e) => setTopicKeywords(e.target.value)}
              placeholder="fitness, nutrition, wellness"
            />
          </div>
        </Card>

        {/* Feature flags */}
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
              checked={isActive}
              onChange={setIsActive}
              label="Client is active"
              description="Inactive clients are hidden from the portal"
            />
          </div>
        </Card>

        <Button type="submit" disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving...' : 'Save settings'}
        </Button>
      </form>
    </div>
  );
}
