'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ClientData {
  id: string;
  name: string;
  slug: string;
  industry: string;
  target_audience: string | null;
  brand_voice: string | null;
  topic_keywords: string[] | null;
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

  // Form state
  const [industry, setIndustry] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [topicKeywords, setTopicKeywords] = useState('');
  const [canSearch, setCanSearch] = useState(true);
  const [canViewReports, setCanViewReports] = useState(true);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    async function fetchClient() {
      const supabase = createClient();
      const { data } = await supabase
        .from('clients')
        .select('id, name, slug, industry, target_audience, brand_voice, topic_keywords, feature_flags, is_active')
        .eq('slug', params.slug)
        .single();

      if (data) {
        setClient(data as ClientData);
        setIndustry(data.industry || '');
        setTargetAudience(data.target_audience || '');
        setBrandVoice(data.brand_voice || '');
        setTopicKeywords((data.topic_keywords || []).join(', '));
        const flags = data.feature_flags as ClientData['feature_flags'];
        setCanSearch(flags?.can_search ?? true);
        setCanViewReports(flags?.can_view_reports ?? true);
        setIsActive(data.is_active);
      }
      setLoading(false);
    }
    fetchClient();
  }, [params.slug]);

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
    return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  }

  if (!client) {
    return <div className="p-6 text-sm text-red-600">Client not found.</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/admin/clients/${params.slug}`} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{client.name}</h1>
          <p className="text-sm text-gray-500">Settings</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Business info */}
        <Card>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Business info</h2>
          <div className="space-y-4">
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
          <h2 className="text-base font-semibold text-gray-900 mb-4">Portal access</h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={canSearch}
                onChange={(e) => setCanSearch(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Can run topic searches</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={canViewReports}
                onChange={(e) => setCanViewReports(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Can view approved reports</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Client is active</span>
            </label>
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
