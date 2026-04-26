'use client';

import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface SyncErrorsPanelProps {
  errors: string[];
}

interface ParsedError {
  message: string;
  reconnectUrl: string | null;
  platform: string | null;
}

const PLATFORM_HINTS: Array<{ key: string; label: string }> = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'google', label: 'Google Business' },
];

function parseError(raw: string): ParsedError {
  // Reconnect URL pattern: "...Reconnect: https://..." (no trailing punctuation)
  let reconnectUrl: string | null = null;
  let message = raw;
  const match = raw.match(/Reconnect:\s*(\S+)/);
  if (match) {
    reconnectUrl = match[1].replace(/[.,]$/, '');
    message = raw.replace(/Reconnect:\s*\S+\s*$/, '').trim();
  }
  const lower = raw.toLowerCase();
  const platform = PLATFORM_HINTS.find((p) => lower.includes(p.key))?.label ?? null;
  return { message, reconnectUrl, platform };
}

export function SyncErrorsPanel({ errors }: SyncErrorsPanelProps) {
  const parsed = errors.map(parseError);
  return (
    <Card className="border-status-warning/30 bg-status-warning/[0.04] p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-status-warning" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-text-primary">
            Some platforms returned partial data on the last sync
          </p>
          <ul className="space-y-1.5 text-sm text-text-secondary">
            {parsed.map((p, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {p.platform && (
                  <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    {p.platform}
                  </span>
                )}
                <span className="break-words">{p.message}</span>
                {p.reconnectUrl && (
                  <a
                    href={p.reconnectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent-text underline-offset-2 hover:underline"
                  >
                    Reconnect <ExternalLink size={12} aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
