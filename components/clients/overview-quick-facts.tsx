'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type QuickFactsProps = {
  slug: string;
  targetAudience: string | null;
  brandVoice: string | null;
  topicKeywords: string[];
  services: string[];
  monthlyBoostingBudget: number | null;
  googleDriveBrandingUrl: string | null;
  googleDriveCalendarsUrl: string | null;
};

export function OverviewQuickFacts(props: QuickFactsProps) {
  const [open, setOpen] = useState(false);
  const settings = `/admin/clients/${props.slug}/settings`;

  const summaryLine = buildSummaryLine(props);

  return (
    <div className="rounded-xl border border-nativz-border-light bg-surface-hover/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover/30 transition-colors cursor-pointer"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {open ? (
              <ChevronDown size={14} className="text-text-muted shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-text-muted shrink-0" />
            )}
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Quick facts
            </p>
          </div>
          {!open && (
            <p className="mt-1 ml-5 text-xs text-text-muted truncate">
              {summaryLine || 'No brand context set'}
            </p>
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-nativz-border-light/50">
          <Section label="Target audience" editHref={`${settings}/brand`}>
            <ValueLine value={props.targetAudience} />
          </Section>
          <Section label="Brand voice" editHref={`${settings}/brand`}>
            <ValueLine value={props.brandVoice} />
          </Section>
          <Section label="Topic keywords" editHref={`${settings}/brand`}>
            {props.topicKeywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {props.topicKeywords.map((k) => (
                  <Badge key={k} variant="default" className="text-[10px]">
                    {k}
                  </Badge>
                ))}
              </div>
            ) : (
              <ValueLine value={null} />
            )}
          </Section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-1">
            <Section label="Services" editHref={`${settings}/access`} compact>
              {props.services.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {props.services.map((svc) => (
                    <Badge key={svc} variant="default" className="text-[10px]">
                      {svc}
                    </Badge>
                  ))}
                </div>
              ) : (
                <ValueLine value={null} />
              )}
            </Section>
            <Section label="Boosting budget" editHref={`${settings}/brand`} compact>
              <ValueLine
                value={
                  props.monthlyBoostingBudget
                    ? `$${props.monthlyBoostingBudget.toLocaleString()}/mo`
                    : null
                }
              />
            </Section>
            <Section label="Resources" editHref={`${settings}/resources`} compact>
              {props.googleDriveBrandingUrl || props.googleDriveCalendarsUrl ? (
                <div className="space-y-1">
                  {props.googleDriveBrandingUrl && (
                    <a
                      href={props.googleDriveBrandingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-accent-text hover:underline"
                    >
                      <ExternalLink size={10} />
                      Branding
                    </a>
                  )}
                  {props.googleDriveCalendarsUrl && (
                    <a
                      href={props.googleDriveCalendarsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-accent-text hover:underline"
                    >
                      <ExternalLink size={10} />
                      Calendars
                    </a>
                  )}
                </div>
              ) : (
                <ValueLine value={null} />
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  editHref,
  compact,
  children,
}: {
  label: string;
  editHref: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p
          className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold uppercase tracking-wider text-text-muted`}
        >
          {label}
        </p>
        <Link
          href={editHref}
          className="text-text-muted hover:text-accent-text transition-colors"
          title="Edit in settings"
        >
          <Pencil size={10} />
        </Link>
      </div>
      {children}
    </div>
  );
}

function ValueLine({ value }: { value: string | null }) {
  if (value) return <p className="text-sm text-text-primary whitespace-pre-line">{value}</p>;
  return <p className="text-sm text-text-muted italic">Not set</p>;
}

function buildSummaryLine({
  brandVoice,
  targetAudience,
  topicKeywords,
  services,
}: QuickFactsProps): string {
  const parts: string[] = [];
  if (brandVoice) parts.push(truncate(brandVoice, 40));
  if (targetAudience) parts.push(truncate(targetAudience, 50));
  if (topicKeywords.length > 0) parts.push(`${topicKeywords.length} keywords`);
  if (services.length > 0) parts.push(services.join(', '));
  return parts.join(' · ');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}
