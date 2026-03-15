'use client';

import { Layers, Zap, ArrowRight } from 'lucide-react';

interface PathSelectorProps {
  onSelectPath: (path: 'pillars' | 'ideas') => void;
  onFullStrategy: () => void;
  disabled?: boolean;
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

export function PathSelector({ onSelectPath, onFullStrategy, disabled }: PathSelectorProps) {
  return (
    <div className={`space-y-4 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Generate Pillars */}
        <button
          onClick={() => onSelectPath('pillars')}
          disabled={disabled}
          className="group relative flex flex-col items-center text-center gap-3 rounded-2xl border border-purple-500/40 p-6 transition-all cursor-pointer hover:border-purple-500/70 hover:bg-purple-500/[0.04]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
            <Layers size={20} className="text-purple-400" />
          </div>
          <div className="space-y-1">
            <span className="text-sm font-semibold text-text-primary">Generate pillars</span>
            <p className="text-xs text-text-secondary leading-relaxed">
              Create content pillars, then generate ideas organized by pillar
            </p>
          </div>
          <span className="text-[11px] font-medium text-purple-400">Recommended</span>
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
          className="text-xs text-text-muted hover:text-purple-400 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
        >
          Generate full strategy with AI &rarr;
        </button>
      </div>
    </div>
  );
}
