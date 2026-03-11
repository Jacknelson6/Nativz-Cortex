'use client';

import Link from 'next/link';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';

export interface ToolResultData {
  success: boolean;
  data?: unknown;
  error?: string;
  link?: { href: string; label: string };
  cardType?: string;
}

function ToolDataSummary({ data, cardType }: { data: Record<string, unknown>; cardType?: string }) {
  if (Array.isArray(data)) {
    return <span>{data.length} item{data.length !== 1 ? 's' : ''} returned</span>;
  }

  if (cardType === 'task' && data.title) {
    return (
      <div className="flex items-center gap-3">
        <span className="font-medium text-text-primary">{String(data.title)}</span>
        {data.status ? <span className="text-text-muted">Status: {String(data.status)}</span> : null}
        {data.priority ? <span className="text-text-muted">Priority: {String(data.priority)}</span> : null}
      </div>
    );
  }

  if (cardType === 'post' && data.caption) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-text-primary truncate">{String(data.caption).slice(0, 80)}</span>
        {data.status ? <span className="text-text-muted">Status: {String(data.status)}</span> : null}
      </div>
    );
  }

  if (cardType === 'analytics') {
    const items: string[] = [];
    if (data.totalViews !== undefined) items.push(`${Number(data.totalViews).toLocaleString()} views`);
    if (data.totalEngagement !== undefined) items.push(`${Number(data.totalEngagement).toLocaleString()} engagements`);
    if (data.totalFollowerChange !== undefined) items.push(`${Number(data.totalFollowerChange) >= 0 ? '+' : ''}${Number(data.totalFollowerChange).toLocaleString()} followers`);
    if (items.length > 0) return <span>{items.join(' · ')}</span>;
  }

  const keys = Object.keys(data);
  return <span>{keys.length} field{keys.length !== 1 ? 's' : ''} returned</span>;
}

export function ToolCard({ toolName, result }: { toolName: string; result: ToolResultData }) {
  const displayName = toolName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  if (!result.success) {
    return (
      <div className="my-2 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
        <XCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-red-400">{displayName}</p>
          <p className="mt-0.5 text-sm text-red-300/80">{result.error}</p>
          {result.link && (
            <Link href={result.link.href} className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent-text hover:underline">
              {result.link.label} <ExternalLink size={10} />
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 flex items-start gap-3 rounded-xl border border-accent/15 bg-accent/[0.04] px-4 py-3">
      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent-text" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-accent-text">{displayName}</p>
          {result.link && (
            <Link href={result.link.href} className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline">
              {result.link.label} <ExternalLink size={10} />
            </Link>
          )}
        </div>
        {result.data != null && typeof result.data === 'object' && (
          <div className="mt-1 text-xs text-text-secondary">
            <ToolDataSummary data={result.data as Record<string, unknown>} cardType={result.cardType} />
          </div>
        )}
      </div>
    </div>
  );
}
