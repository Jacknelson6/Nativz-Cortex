'use client';

import {
  Palette, Type, Globe, Users, Target,
  FileText, Image, Check, Pencil, ChevronRight,
} from 'lucide-react';
import type { BrandColor, BrandFont, BrandLogo } from '@/lib/knowledge/types';
import { BrandDnaGoogleFontLink } from './brand-dna-google-font-link';

/** Surface, radius, and hairline border shared by bento cards and full-guideline blocks */
export const BRAND_DNA_BENTO_SURFACE = 'rounded-xl border border-nativz-border bg-surface/20';

interface BrandDNACardsProps {
  metadata: Record<string, unknown>;
  clientId: string;
  /** Show edit buttons (admin only) */
  editable?: boolean;
  onEditSection?: (section: string) => void;
}

/**
 * Bento-grid layout showing Brand DNA sections as visual cards.
 * Inspired by the Holo-style brand board UI.
 */
export function BrandDNACards({ metadata, clientId: _clientId, editable = false, onEditSection }: BrandDNACardsProps) {
  const colors = (metadata.colors as BrandColor[]) ?? [];
  const fonts = (metadata.fonts as BrandFont[]) ?? [];
  const logos = (metadata.logos as BrandLogo[]) ?? [];
  const tonePrimary = (metadata.tone_primary as string) ?? '';
  const voiceAttributes = (metadata.voice_attributes as string[]) ?? [];
  const messagingPillars = (metadata.messaging_pillars as string[]) ?? [];
  const targetAudience = (metadata.target_audience_summary as string) ?? '';
  const positioning = (metadata.competitive_positioning as string) ?? '';
  const verified = (metadata.verified_sections as Record<string, unknown>) ?? {};

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
      {/* Row 1: Logo, Typography, Colors — logo height capped so row 1 stays even */}
      <BentoCard
        title="Logo"
        icon={<Image size={14} />}
        verified={!!verified['Logo']}
        editable={editable}
        onEdit={() => onEditSection?.('Logo')}
      >
        {logos.length > 0 ? (
          <div className="flex h-[7.5rem] max-h-[7.5rem] items-center justify-center rounded-lg bg-surface/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logos[0].url}
              alt="Brand logo"
              className="max-h-[5.5rem] max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex h-[7.5rem] max-h-[7.5rem] items-center justify-center rounded-lg bg-surface/30">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-surface/40">
              <Image size={24} className="text-text-muted/40" />
            </div>
          </div>
        )}
      </BentoCard>

      <BentoCard
        title="Typography"
        icon={<Type size={14} />}
        verified={!!verified['Typography']}
        editable={editable}
        onEdit={() => onEditSection?.('Typography')}
      >
        {fonts.length > 0 ? (
          <>
            <BrandDnaGoogleFontLink
              families={fonts.slice(0, 2).map((f) => f.family).filter((f) => f?.trim())}
            />
            <div className="flex h-[7.5rem] flex-col items-center justify-center gap-1">
              <p
                className="text-2xl font-bold text-text-primary"
                style={{
                  fontFamily: fonts[0]?.family
                    ? `"${fonts[0].family}", ui-sans-serif, system-ui, sans-serif`
                    : 'ui-sans-serif, system-ui, sans-serif',
                }}
              >
                Aa
              </p>
              <p className="text-xs text-text-muted">{fonts[0]?.family}</p>
              {fonts[1] ? (
                <p
                  className="text-[10px] text-text-muted/60"
                  style={{ fontFamily: `"${fonts[1].family}", ui-sans-serif, system-ui, sans-serif` }}
                >
                  {fonts[1].family} ({fonts[1].role})
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-xs text-text-muted/60 text-center">No fonts detected</p>
        )}
      </BentoCard>

      <BentoCard
        title="Colors"
        icon={<Palette size={14} />}
        verified={!!verified['Colors']}
        editable={editable}
        onEdit={() => onEditSection?.('Colors')}
      >
        {colors.length > 0 ? (
          <div className="grid h-[7.5rem] grid-cols-2 grid-rows-2 gap-1.5">
            {colors.slice(0, 4).map((c, i) => (
              <div
                key={i}
                className="relative min-h-0 min-w-0 overflow-hidden rounded-lg ring-1 ring-black/15"
                title={`${c.name?.trim() ? c.name : c.role} · ${c.hex}`}
              >
                <div className="absolute inset-0" style={{ backgroundColor: c.hex }} />
                <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 backdrop-blur-[1px]">
                  <p className="truncate text-center text-[10px] font-semibold capitalize leading-tight text-white">
                    {c.role ?? 'Color'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted/60 text-center">No colors detected</p>
        )}
      </BentoCard>

      {/* Row 2: Headline/Tone, Design Style, Images/Screenshots */}
      <BentoCard
        title="Tone of voice"
        icon={<FileText size={14} />}
        verified={!!verified['Verbal identity']}
        editable={editable}
        onEdit={() => onEditSection?.('Verbal identity')}
      >
        {tonePrimary ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary capitalize">{tonePrimary}</p>
            {voiceAttributes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {voiceAttributes.slice(0, 3).map((attr, i) => (
                  <span key={i} className="rounded-full bg-surface/60 px-2 py-0.5 text-[10px] text-text-muted">
                    {attr}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-text-muted/60">No tone detected</p>
        )}
      </BentoCard>

      <BentoCard
        title="Audience"
        icon={<Users size={14} />}
        verified={!!verified['Target audience']}
        editable={editable}
        onEdit={() => onEditSection?.('Target audience')}
      >
        {targetAudience ? (
          <LineClampText lines={6}>{targetAudience}</LineClampText>
        ) : (
          <p className="text-xs text-text-muted/60">No audience data</p>
        )}
      </BentoCard>

      {/* NAT-57 follow-up (polish pass 3): Products card removed from
          the Brand DNA grid. Products live in the admin-side brand
          settings (products column on clients) — the DNA surface is
          for visual + verbal identity only. */}

      {/* Row 3: Messaging pillars, Positioning, Design style */}
      <BentoCard
        title="Messaging pillars"
        icon={<Target size={14} />}
        verified={!!verified['Verbal identity']}
        editable={editable}
        onEdit={() => onEditSection?.('Verbal identity')}
      >
        {messagingPillars.length > 0 ? (
          <div className="space-y-1">
            {messagingPillars.slice(0, 4).map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <ChevronRight size={10} className="text-accent-text shrink-0" />
                <span className="text-xs text-text-secondary">{p}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted/60">No pillars detected</p>
        )}
      </BentoCard>

      <BentoCard
        title="Positioning"
        icon={<Globe size={14} />}
        verified={!!verified['Competitive positioning']}
        editable={editable}
        onEdit={() => onEditSection?.('Competitive positioning')}
        className="sm:col-span-2 lg:col-span-2"
      >
        {positioning ? (
          <LineClampText lines={10}>{positioning}</LineClampText>
        ) : (
          <p className="text-xs text-text-muted/60">No positioning data</p>
        )}
      </BentoCard>
    </div>
  );
}

const LINE_CLAMP_BY_LINES: Record<number, string> = {
  4: 'line-clamp-4',
  6: 'line-clamp-6',
  8: 'line-clamp-8',
  10: 'line-clamp-[10]',
};

/** Truncates long DNA copy with ellipsis — cards stay non-scrollable */
function LineClampText({ children, lines }: { children: string; lines: 4 | 6 | 8 | 10 }) {
  const clamp = LINE_CLAMP_BY_LINES[lines] ?? 'line-clamp-6';
  return <p className={`text-xs leading-relaxed text-text-secondary ${clamp}`}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Bento card wrapper
// ---------------------------------------------------------------------------

function BentoCard({
  title,
  icon,
  children,
  verified,
  editable,
  onEdit,
  className = '',
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  verified?: boolean;
  editable?: boolean;
  onEdit?: () => void;
  className?: string;
}) {
  const canEdit = Boolean(editable && onEdit);

  const body = (
    <>
      <div className="mb-2 min-h-0 flex-1">{children}</div>
      <div className="mt-auto flex shrink-0 items-center justify-between border-t border-nativz-border/40 pt-2">
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">{icon}</span>
          <span className="text-xs font-medium text-text-muted">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {verified ? (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15">
              <Check size={8} className="text-emerald-400" />
            </div>
          ) : null}
          {canEdit ? (
            <span className="text-text-muted/70" aria-hidden>
              <Pencil size={10} />
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  const surface = `group relative flex h-full min-h-0 w-full flex-col ${BRAND_DNA_BENTO_SURFACE} p-3 font-[inherit] text-left ${className}`;

  if (canEdit) {
    return (
      <button
        type="button"
        className={`${surface} cursor-pointer transition-[background-color,box-shadow] hover:bg-surface/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
        onClick={onEdit}
        aria-label={`Edit ${title}`}
      >
        {body}
      </button>
    );
  }

  return <div className={surface}>{body}</div>;
}
