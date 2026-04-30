'use client';

import { useState, useEffect, useRef } from 'react';
import { Globe, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import type { OnboardFormData } from '@/lib/types/strategy';

type LifecycleChoice = NonNullable<OnboardFormData['lifecycle_state']>;

interface OnboardInputProps {
  onNext: (data: Pick<OnboardFormData, 'name' | 'website_url' | 'lifecycle_state'>) => void;
}

// Easter egg: the input label subtly pulses blue when a valid URL is detected
export function OnboardInput({ onNext }: OnboardInputProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [urlValid, setUrlValid] = useState(false);
  // Default to 'lead' (prospect) since most brands added here are inbound
  // sales prospects, not existing accounts.
  const [lifecycle, setLifecycle] = useState<LifecycleChoice>('lead');
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

  function submit() {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    onNext({ name: name.trim(), website_url: fullUrl, lifecycle_state: lifecycle });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canProceed) return;
    submit();
  }

  // Easter egg: pressing Cmd+Enter also submits
  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canProceed) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="animate-fade-slide-in">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-text-primary">
          Who&apos;s the brand?
        </h2>
        <p className="text-sm text-text-muted mt-1.5">
          Just a name and website, we&apos;ll figure out the rest.
        </p>
      </div>

      <Card className="max-w-md mx-auto">
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-5">
          <div>
            <p className="text-xs font-medium text-text-muted mb-2">Status</p>
            <div
              role="radiogroup"
              aria-label="Brand status"
              className="inline-flex w-full p-1 rounded-lg bg-white/5 border border-nativz-border"
            >
              <LifecycleOption
                label="Existing client"
                value="active"
                current={lifecycle}
                onSelect={setLifecycle}
              />
              <LifecycleOption
                label="Prospect"
                value="lead"
                current={lifecycle}
                onSelect={setLifecycle}
              />
            </div>
          </div>

          <Input
            ref={nameRef}
            id="client-name"
            label="Brand name"
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

function LifecycleOption({
  label,
  value,
  current,
  onSelect,
}: {
  label: string;
  value: LifecycleChoice;
  current: LifecycleChoice;
  onSelect: (v: LifecycleChoice) => void;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        selected
          ? 'bg-accent/15 text-accent'
          : 'text-text-muted hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}
