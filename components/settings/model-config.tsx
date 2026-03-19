'use client';

import { useState, useEffect } from 'react';
import { Cpu, Check, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

const POPULAR_MODELS = [
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku' },
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

export function ModelConfig() {
  const [currentModel, setCurrentModel] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchModel() {
      try {
        const res = await fetch('/api/settings/ai-model');
        if (!res.ok) throw new Error('Failed to fetch model');
        const data = await res.json();
        setCurrentModel(data.model);
        setInputValue(data.model);
        setUpdatedAt(data.updatedAt);
      } catch {
        setError('Failed to load model settings');
      } finally {
        setLoading(false);
      }
    }
    fetchModel();
  }, []);

  async function handleSave() {
    if (!inputValue.trim() || inputValue === currentModel) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/settings/ai-model', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: inputValue.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      const data = await res.json();
      setCurrentModel(data.model);
      setUpdatedAt(data.updatedAt);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model');
    } finally {
      setSaving(false);
    }
  }

  function selectModel(modelId: string) {
    setInputValue(modelId);
  }

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-3 animate-pulse">
          <div className="h-10 w-10 rounded-xl bg-surface-hover" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-32 rounded bg-surface-hover" />
            <div className="h-3 w-48 rounded bg-surface-hover" />
          </div>
        </div>
      </Card>
    );
  }

  const hasChanges = inputValue.trim() !== currentModel;

  return (
    <Card>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface">
            <Cpu size={20} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Active model
            </h2>
            <p className="text-xs text-text-muted">
              Platform-wide OpenRouter model for all AI features
            </p>
          </div>
        </div>

        {/* Current model display */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover border border-nativz-border">
          <span className="text-xs text-text-muted">Currently active:</span>
          <code className="text-sm font-mono text-accent-text">{currentModel}</code>
          {updatedAt && (
            <span className="ml-auto text-xs text-text-muted">
              Updated {new Date(updatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>

        {/* Popular models quick-pick */}
        <div>
          <p className="text-xs text-text-muted mb-2">Popular models</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => selectModel(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  inputValue === m.id
                    ? 'bg-accent-surface text-accent-text border-accent/30'
                    : 'bg-surface text-text-secondary border-nativz-border hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input + save */}
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setError(null);
              setSuccess(false);
            }}
            placeholder="e.g., anthropic/claude-3.5-haiku"
            className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/25 transition-colors"
          />
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || !inputValue.trim()}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-accent-surface text-accent-text hover:bg-accent/20"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : success ? (
              <Check size={14} />
            ) : null}
            {saving ? 'Saving...' : success ? 'Saved' : 'Save'}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        {/* Success message */}
        {success && (
          <p className="text-xs text-emerald-400">
            Model updated. Changes take effect on the next AI request.
          </p>
        )}
      </div>
    </Card>
  );
}
