'use client';

import { Layers, Zap, ArrowRight } from 'lucide-react';

interface PathSelectorProps {
  onSelectPath: (path: 'pillars' | 'ideas') => void;
  onFullStrategy: () => void;
  disabled?: boolean;
  /** Pillars require a client — disable the pillar path when only a URL is provided */
  hasClient?: boolean;
}

const paths = [
  {
    id: 'pillars' as const,
    icon: Layers,
    title: 'Start with pillars',
    description: 'Generate content pillars first, then create ideas organized by pillar',
    note: 'Recommended for new clients',
    highlight: true,
  },
  {
    id: 'ideas' as const,
    icon: Zap,
    title: 'Jump to ideas',
    description: 'Generate video ideas directly without pillar structure',
    note: 'Quick ideation sessions',
    highlight: false,
  },
] as const;

export function PathSelector({ onSelectPath, onFullStrategy, disabled, hasClient = true }: PathSelectorProps) {
  const pillarDisabled = disabled || !hasClient;

  return (
    <div className={`space-y-4 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Generate Pillars */}
        <button
          onClick={() => onSelectPath('pillars')}
          disabled={pillarDisabled}
          className={`group relative flex flex-col items-center text-center gap-3 rounded-2xl border p-6 transition-all ${
            pillarDisabled
              ? 'border-nativz-border opacity-40 cursor-not-allowed'
              : 'border-accent2/40 cursor-pointer hover:border-accent2/70 hover:bg-accent2/[0.04]'
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent2-surface">
            <Layers size={20} className="text-accent2-text" />
          </div>
          <div className="space-y-1">
            <span className="text-sm font-semibold text-text-primary">Generate pillars</span>
            <p className="text-xs text-text-secondary leading-relaxed">
              Create content pillars, then generate ideas organized by pillar
            </p>
          </div>
          <span className={`text-[11px] font-medium ${pillarDisabled && !disabled ? 'text-text-muted' : 'text-accent2-text'}`}>
            {pillarDisabled && !disabled ? 'Requires a client' : 'Recommended'}
          </span>
        </button>

        {/* Generate Video Ideas */}
        <button
          onClick={() => onSelectPath('ideas')}
          disabled={disabled}
          className="group relative flex flex-col items-center text-center gap-3 rounded-2xl border border-nativz-border p-6 transition-all cursor-pointer hover:border-text-muted/40 hover:bg-surface-hover"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface border border-nativz-border">
            <Zap size={20} className="text-text-muted" />
          </div>
          <div className="space-y-1">
            <span className="text-sm font-semibold text-text-primary">Generate video ideas</span>
            <p className="text-xs text-text-secondary leading-relaxed">
              Jump straight to AI-powered video ideas without pillar structure
            </p>
          </div>
          <span className="text-[11px] font-medium text-text-muted">Quick ideation</span>
        </button>
      </div>

      <div className="text-center">
        <button
          onClick={onFullStrategy}
          disabled={disabled}
          className="text-xs text-text-muted hover:text-accent2-text transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
        >
          Generate full strategy with AI &rarr;
        </button>
      </div>
    </div>
  );
}
