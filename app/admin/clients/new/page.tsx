'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Sparkles, Loader2, Globe } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ImageUpload } from '@/components/ui/image-upload';
import { OnboardWizard } from '@/components/brand-dna/onboard-wizard';
import { normalizeWebsiteUrl, isValidWebsiteUrl } from '@/lib/utils/normalize-website-url';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function AdminNewClientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [shakeButton, setShakeButton] = useState(false);
  const [brandDnaOpen, setBrandDnaOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [industry, setIndustry] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [topicKeywords, setTopicKeywords] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  }

  async function handleAutoFill() {
    const url = normalizeWebsiteUrl(websiteUrl);
    if (!url) return;
    if (!isValidWebsiteUrl(url)) {
      toast.error('Enter a valid website (e.g. example.com)');
      return;
    }
    if (url !== websiteUrl.trim()) setWebsiteUrl(url);
    setAnalyzing(true);
    try {
      const res = await fetch('/api/clients/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Could not analyze website.');
        return;
      }

      const data = await res.json();
      // Only fill empty fields
      if (!industry) setIndustry(data.industry || '');
      if (!targetAudience) setTargetAudience(data.target_audience || '');
      if (!brandVoice) setBrandVoice(data.brand_voice || '');
      if (!topicKeywords && data.topic_keywords?.length > 0) {
        setTopicKeywords(data.topic_keywords.join(', '));
      }
      toast.success('Fields auto-filled from website');
    } catch {
      toast.error('Failed to analyze website. Try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !industry.trim()) {
      setShakeButton(true);
      setTimeout(() => setShakeButton(false), 500);
      return;
    }

    setError('');
    setSaving(true);

    const siteUrl = websiteUrl.trim() ? normalizeWebsiteUrl(websiteUrl) : '';
    if (siteUrl && !isValidWebsiteUrl(siteUrl)) {
      setError('Enter a valid website URL or leave it blank.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug || slugify(name),
          industry: industry.trim(),
          target_audience: targetAudience.trim() || null,
          brand_voice: brandVoice.trim() || null,
          topic_keywords: topicKeywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
          logo_url: logoUrl || null,
          website_url: siteUrl || null,
        }),
      });

      if (res.status === 409) {
        setError('A client with this slug already exists. Try a different name or edit the slug.');
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create client. Try again.');
        return;
      }

      const client = await res.json();
      toast.success(`${client.name} created`);
      router.push(`/admin/clients/${client.slug}`);
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/clients" className="text-text-muted hover:text-text-secondary transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Add client</h1>
          <p className="text-sm text-text-muted">Create a new client to run searches for</p>
        </div>
      </div>

      {/* Brand DNA onboarding option */}
      <Card interactive className="cursor-pointer" onClick={() => setBrandDnaOpen(true)}>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-surface shrink-0">
            <Globe size={22} className="text-accent-text" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-text-primary">Brand DNA onboarding</p>
            <p className="text-xs text-text-muted">
              Drop a website URL — AI crawls and builds a full brand guideline automatically
            </p>
          </div>
          <span className="text-[10px] font-medium text-accent-text bg-accent-surface rounded-full px-2 py-0.5">Recommended</span>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-nativz-border" />
        <span className="text-[10px] text-text-muted uppercase tracking-wider">or add manually</span>
        <div className="flex-1 h-px bg-nativz-border" />
      </div>

      <OnboardWizard open={brandDnaOpen} onClose={() => setBrandDnaOpen(false)} />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Basic info</h2>
          <div className="space-y-4">
            <ImageUpload value={logoUrl} onChange={setLogoUrl} />
            <Input
              id="name"
              label="Client name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Toastique"
              required
              autoFocus
            />
            <Input
              id="slug"
              label="URL slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                setSlugEdited(true);
              }}
              placeholder="toastique"
              required
              pattern="^[a-z0-9-]+$"
              error={slug && !/^[a-z0-9-]+$/.test(slug) ? 'Lowercase letters, numbers, and hyphens only' : undefined}
            />
            <Input
              id="industry"
              label="Industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Healthy Food & Beverage"
              required
            />
          </div>
        </Card>

        {/* Details */}
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Details (optional)</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Input
                id="website_url"
                label="Website URL"
                type="text"
                inputMode="url"
                autoComplete="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                onBlur={() => {
                  const n = normalizeWebsiteUrl(websiteUrl);
                  if (n && n !== websiteUrl.trim()) setWebsiteUrl(n);
                }}
                placeholder="example.com or https://example.com"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoFill}
                disabled={analyzing || !websiteUrl.trim()}
              >
                {analyzing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Auto-fill with AI
                  </>
                )}
              </Button>
            </div>
            <Textarea
              id="target_audience"
              label="Target audience"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="Health-conscious millennials and Gen Z in urban areas"
              rows={3}
            />
            <Textarea
              id="brand_voice"
              label="Brand voice"
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              placeholder="Friendly, energetic, health-forward"
              rows={3}
            />
            <Input
              id="topic_keywords"
              label="Topic keywords (comma-separated)"
              value={topicKeywords}
              onChange={(e) => setTopicKeywords(e.target.value)}
              placeholder="acai bowls, healthy eating, smoothie recipes"
            />
          </div>
        </Card>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button
          type="submit"
          disabled={saving}
          className={shakeButton ? 'animate-[shake_0.3s_ease-in-out]' : ''}
        >
          <Plus size={16} />
          {saving ? 'Creating...' : 'Create client'}
        </Button>
      </form>
    </div>
  );
}
