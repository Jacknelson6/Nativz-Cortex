'use client';

import { useState, useEffect, useRef } from 'react';
import { Globe, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import type { OnboardFormData } from '@/lib/types/strategy';

interface OnboardInputProps {
  onNext: (data: Pick<OnboardFormData, 'name' | 'website_url'>) => void;
}

// Easter egg: the input label subtly pulses blue when a valid URL is detected
export function OnboardInput({ onNext }: OnboardInputProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [urlValid, setUrlValid] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the name field with a slight delay for the entrance animation
    const timer = setTimeout(() => nameRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      setUrlValid(!!parsed.hostname && parsed.hostname.includes('.'));
    } catch {
      setUrlValid(false);
    }
  }, [url]);

  const canProceed = name.trim().length >= 2 && urlValid;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canProceed) return;
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    onNext({ name: name.trim(), website_url: fullUrl });
  }

  // Easter egg: pressing Cmd+Enter also submits
  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canProceed) {
      e.preventDefault();
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      onNext({ name: name.trim(), website_url: fullUrl });
    }
  }

  return (
    <div className="animate-fade-slide-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium mb-4">
          <Sparkles size={12} />
          New client
        </div>
        <h2 className="text-xl font-semibold text-text-primary">
          Who are we onboarding?
        </h2>
        <p className="text-sm text-text-muted mt-1.5">
          Just a name and website — we&apos;ll figure out the rest
        </p>
      </div>

      <Card className="max-w-md mx-auto">
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-5">
          <Input
            ref={nameRef}
            id="client-name"
            label="Client name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Coffee Co."
            autoComplete="off"
          />

          <div className="relative">
            <Input
              id="client-url"
              label="Website"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="acmecoffee.com"
              autoComplete="off"
            />
            {/* Subtle indicator that URL is recognized */}
            {urlValid && (
              <div className="absolute right-3 top-9 transition-opacity duration-300">
                <Globe size={14} className="text-accent animate-fade-slide-in" />
              </div>
            )}
          </div>

          <GlassButton type="submit" disabled={!canProceed} className="w-full">
            <Sparkles size={14} />
            Analyze with AI
          </GlassButton>

          {/* Keyboard shortcut hint — appears after 3 seconds */}
          <p className="text-[10px] text-text-muted text-center opacity-0 animate-[fadeIn_0.3s_ease_3s_forwards]">
            &#8984;+Enter to continue
          </p>
        </form>
      </Card>
    </div>
  );
}
