'use client';

// SPY-02 T09: one row per platform in the confirm-platforms surface.
// Renders the auto-detected handle plus inline controls for swapping
// to a candidate, pasting a manual override, toggling inclusion, and
// promoting to primary platform.

import { useState } from 'react';
import { Check, ChevronDown, Pin } from 'lucide-react';

export type ConfirmRowPlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook';

const PLATFORM_LABELS: Record<ConfirmRowPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
};

const CONFIDENCE_CLASS: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-400',
  low: 'bg-neutral-500',
};

interface Candidate {
  handle: string;
  profile_url: string;
  reason: string;
}

interface Detection {
  handle: string | null;
  profile_url: string | null;
  confidence: 'high' | 'medium' | 'low';
  candidates: Candidate[];
}

interface Props {
  platform: ConfirmRowPlatform;
  detection: Detection;
  included: boolean;
  manualOverride: { handle: string; profile_url: string } | null;
  isPrimary: boolean;
  onToggle: (included: boolean) => void;
  onPickCandidate: (c: { handle: string; profile_url: string }) => void;
  onManualOverride: (v: { handle: string; profile_url: string } | null) => void;
  onSetPrimary: () => void;
}

export function PlatformConfirmRow({
  platform,
  detection,
  included,
  manualOverride,
  isPrimary,
  onToggle,
  onPickCandidate,
  onManualOverride,
  onSetPrimary,
}: Props) {
  const [showCandidates, setShowCandidates] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualHandle, setManualHandle] = useState(manualOverride?.handle ?? '');

  const activeHandle = manualOverride?.handle ?? detection.handle ?? '';
  const activeUrl = manualOverride?.profile_url ?? detection.profile_url ?? null;

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border ${
        included ? 'border-border bg-surface' : 'border-border/60 bg-surface/40'
      } p-3`}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Include ${PLATFORM_LABELS[platform]}`}
          className="h-4 w-4 accent-accent"
        />
        <div className="flex w-24 shrink-0 items-center gap-2 text-sm font-medium">
          {PLATFORM_LABELS[platform]}
        </div>
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${CONFIDENCE_CLASS[detection.confidence]}`}
          aria-label={`${detection.confidence} confidence`}
        />
        <div className="min-w-0 flex-1 truncate text-sm">
          {activeHandle ? (
            <span className="text-foreground">@{activeHandle}</span>
          ) : (
            <span className="text-text-muted">No handle detected</span>
          )}
        </div>
        {isPrimary ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent-text">
            <Pin size={10} /> Primary
          </span>
        ) : included && activeHandle ? (
          <button
            type="button"
            onClick={onSetPrimary}
            className="text-[11px] text-accent-text hover:underline"
          >
            Set as primary
          </button>
        ) : null}
      </div>

      {(detection.candidates.length > 0 || manualOverride) && (
        <div className="flex items-center gap-3 pl-7 text-[11px]">
          {detection.candidates.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCandidates((v) => !v)}
              className="inline-flex items-center gap-1 text-text-muted hover:text-foreground"
            >
              Use other <ChevronDown size={10} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="text-text-muted hover:text-foreground"
          >
            {showManual ? 'Hide manual entry' : 'Paste handle manually'}
          </button>
          {manualOverride && (
            <button
              type="button"
              onClick={() => {
                onManualOverride(null);
                setManualHandle('');
              }}
              className="text-text-muted hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {showCandidates && detection.candidates.length > 0 && (
        <ul className="ml-7 flex flex-col gap-1 text-[12px]">
          {detection.candidates.map((c) => (
            <li key={`${c.handle}-${c.profile_url}`}>
              <button
                type="button"
                onClick={() => {
                  onPickCandidate({ handle: c.handle, profile_url: c.profile_url });
                  setShowCandidates(false);
                }}
                className="inline-flex w-full items-center gap-2 rounded border border-transparent px-2 py-1 text-left text-text-primary hover:border-border hover:bg-background"
              >
                <Check size={12} className="opacity-60" />
                <span className="font-medium">@{c.handle}</span>
                <span className="truncate text-text-muted">{c.reason}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showManual && (
        <div className="ml-7 flex items-center gap-2">
          <input
            type="text"
            value={manualHandle}
            onChange={(e) => setManualHandle(e.target.value.replace(/^@/, ''))}
            placeholder="handle"
            className="w-48 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            disabled={!manualHandle.trim()}
            onClick={() => {
              const handle = manualHandle.trim().replace(/^@/, '');
              if (!handle) return;
              const url = buildProfileUrl(platform, handle);
              onManualOverride({ handle, profile_url: url });
              setShowManual(false);
            }}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground hover:bg-background disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      {activeUrl && (
        <a
          href={activeUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-7 truncate text-[11px] text-text-muted hover:text-accent-text"
        >
          {activeUrl}
        </a>
      )}
    </div>
  );
}

function buildProfileUrl(platform: ConfirmRowPlatform, handle: string): string {
  switch (platform) {
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`;
    case 'instagram':
      return `https://www.instagram.com/${handle}/`;
    case 'youtube':
      return handle.startsWith('UC')
        ? `https://www.youtube.com/channel/${handle}`
        : `https://www.youtube.com/@${handle}`;
    case 'facebook':
      return `https://www.facebook.com/${handle}`;
  }
}
