'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [industry, setIndustry] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [topicKeywords, setTopicKeywords] = useState('');

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Basic info</h2>
          <div className="space-y-4">
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
