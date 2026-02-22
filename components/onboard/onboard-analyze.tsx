'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Check, PenLine, Sparkles, Tag, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import type { OnboardFormData } from '@/lib/types/strategy';

interface OnboardAnalyzeProps {
  name: string;
  websiteUrl: string;
  onNext: (data: OnboardFormData) => void;
  onBack: () => void;
}

export function OnboardAnalyze({ name, websiteUrl, onNext, onBack }: OnboardAnalyzeProps) {
  const [analyzing, setAnalyzing] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<OnboardFormData>({
    name,
    website_url: websiteUrl,
    industry: '',
    target_audience: '',
    brand_voice: '',
    topic_keywords: [],
    logo_url: null,
  });
  const [newKeyword, setNewKeyword] = useState('');
  const [fieldsEdited, setFieldsEdited] = useState(false);

  const analyze = useCallback(async () => {
    setAnalyzing(true);
    setError('');
    try {
      const res = await fetch('/api/clients/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Analysis failed. You can fill in the details manually.');
        setAnalyzing(false);
        return;
      }

      const data = await res.json();
      setFormData((prev) => ({
        ...prev,
        industry: data.industry || '',
        target_audience: data.target_audience || '',
        brand_voice: data.brand_voice || '',
        topic_keywords: data.topic_keywords || [],
        logo_url: data.logo_url || null,
      }));
    } catch {
      setError('Could not reach the server. Fill in details manually.');
    } finally {
      setAnalyzing(false);
    }
  }, [websiteUrl]);

  useEffect(() => {
    analyze();
  }, [analyze]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.industry.trim()) return;
    onNext(formData);
  }

  function addKeyword() {
    const kw = newKeyword.trim();
    if (kw && !formData.topic_keywords.includes(kw)) {
      setFormData((prev) => ({
        ...prev,
        topic_keywords: [...prev.topic_keywords, kw],
      }));
      setNewKeyword('');
      setFieldsEdited(true);
    }
  }

  function removeKeyword(kw: string) {
    setFormData((prev) => ({
      ...prev,
      topic_keywords: prev.topic_keywords.filter((k) => k !== kw),
    }));
    setFieldsEdited(true);
  }

  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] animate-fade-slide-in">
        <div className="relative mb-6">
          {/* Pulsing ring behind the loader */}
          <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-surface border border-accent/30">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        </div>
        <p className="text-base font-medium text-text-primary">Scanning {name}&apos;s website</p>
        <p className="text-sm text-text-muted mt-1">Extracting brand identity with AI...</p>

        {/* Easter egg: typing dots that cycle */}
        <div className="flex gap-1 mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-accent/50"
              style={{
                animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-slide-in">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-text-primary">
          {error ? 'Fill in the details' : 'AI found this about'} {name}
        </h2>
        <p className="text-sm text-text-muted mt-1">
          {error
            ? 'We couldn\'t auto-fill everything. Complete the fields below.'
            : 'Review and tweak anything that doesn\'t look right'}
        </p>
        {error && (
          <p className="text-xs text-amber-400 mt-2">{error}</p>
        )}
      </div>

      <Card className="max-w-lg mx-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Logo preview */}
          {formData.logo_url && (
            <div className="flex justify-center mb-2">
              <div className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={formData.logo_url}
                  alt={`${name} logo`}
                  className="h-16 w-16 rounded-2xl object-cover border border-nativz-border shadow-card"
                />
                <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Check size={12} className="text-accent" />
                </div>
              </div>
            </div>
          )}

          <Input
            id="industry"
            label="Industry"
            value={formData.industry}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, industry: e.target.value }));
              setFieldsEdited(true);
            }}
            placeholder="e.g. Specialty Coffee & Cafe"
            required
          />

          <Input
            id="target_audience"
            label="Target audience"
            value={formData.target_audience}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, target_audience: e.target.value }));
              setFieldsEdited(true);
            }}
            placeholder="e.g. Young professionals who love craft coffee"
          />

          <Input
            id="brand_voice"
            label="Brand voice"
            value={formData.brand_voice}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, brand_voice: e.target.value }));
              setFieldsEdited(true);
            }}
            placeholder="e.g. Warm, knowledgeable, slightly playful"
          />

          {/* Keywords */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">Topic keywords</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {formData.topic_keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/10 text-accent text-xs font-medium group"
                >
                  <Tag size={10} />
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeKeyword(kw)}
                    className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                id="new-keyword"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Add keyword..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addKeyword}>
                Add
              </Button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onBack} className="flex-1">
              Back
            </Button>
            <GlassButton
              type="submit"
              disabled={!formData.industry.trim()}
              className="flex-[2]"
            >
              <Sparkles size={14} />
              {fieldsEdited ? 'Continue with changes' : 'Looks good — continue'}
            </GlassButton>
          </div>
        </form>
      </Card>

      {/* Subtle hint */}
      {!fieldsEdited && !error && (
        <p className="text-center text-[10px] text-text-muted mt-4 flex items-center justify-center gap-1 opacity-60">
          <PenLine size={10} />
          Click any field to edit
        </p>
      )}
    </div>
  );
}
