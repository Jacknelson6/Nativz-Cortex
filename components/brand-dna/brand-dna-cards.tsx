'use client';

import { useState } from 'react';
import {
  Palette, Type, Globe, ShoppingBag, Users, Target,
  FileText, Image, Check, Pencil, ChevronRight,
} from 'lucide-react';
import type {
  BrandColor, BrandFont, BrandLogo, ProductItem, DesignStyle,
} from '@/lib/knowledge/types';

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
export function BrandDNACards({ metadata, clientId, editable = false, onEditSection }: BrandDNACardsProps) {
  const colors = (metadata.colors as BrandColor[]) ?? [];
  const fonts = (metadata.fonts as BrandFont[]) ?? [];
  const logos = (metadata.logos as BrandLogo[]) ?? [];
  const products = (metadata.products as ProductItem[]) ?? [];
  const designStyle = (metadata.design_style as DesignStyle) ?? null;
  const screenshots = (metadata.screenshots as { url: string; page: string }[]) ?? [];
  const tonePrimary = (metadata.tone_primary as string) ?? '';
  const voiceAttributes = (metadata.voice_attributes as string[]) ?? [];
  const messagingPillars = (metadata.messaging_pillars as string[]) ?? [];
  const targetAudience = (metadata.target_audience_summary as string) ?? '';
  const positioning = (metadata.competitive_positioning as string) ?? '';
  const verified = (metadata.verified_sections as Record<string, unknown>) ?? {};

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Row 1: Logo, Brand Name, Colors */}
      <BentoCard
        title="Logo"
        icon={<Image size={14} />}
        verified={!!verified['Logo']}
        editable={editable}
        onEdit={() => onEditSection?.('Logo')}
        className="row-span-1"
      >
        {logos.length > 0 ? (
          <div className="flex items-center justify-center h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logos[0].url}
              alt="Brand logo"
              className="max-h-20 max-w-full object-contain rounded-lg"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="w-16 h-16 rounded-xl bg-white/[0.04] flex items-center justify-center">
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
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <p className="text-2xl font-bold text-text-primary" style={{ fontFamily: fonts[0]?.family }}>
              Aa
            </p>
            <p className="text-xs text-text-muted">{fonts[0]?.family}</p>
            {fonts[1] && (
              <p className="text-[10px] text-text-muted/60">{fonts[1].family} ({fonts[1].role})</p>
            )}
          </div>
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
          <div className="grid grid-cols-2 gap-1.5">
            {colors.slice(0, 4).map((c, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg"
                style={{ backgroundColor: c.hex }}
                title={`${c.hex} (${c.role})`}
              />
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
                  <span key={i} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-text-muted">
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
          <p className="text-xs text-text-secondary leading-relaxed line-clamp-4">{targetAudience}</p>
        ) : (
          <p className="text-xs text-text-muted/60">No audience data</p>
        )}
      </BentoCard>

      <BentoCard
        title="Products"
        icon={<ShoppingBag size={14} />}
        verified={!!verified['Product catalog']}
        editable={editable}
        onEdit={() => onEditSection?.('Product catalog')}
      >
        {products.length > 0 ? (
          <div className="space-y-1">
            {products.slice(0, 3).map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                {p.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.imageUrl} alt={p.name} className="h-6 w-6 rounded object-cover shrink-0" />
                ) : (
                  <div className="h-6 w-6 rounded bg-white/[0.04] shrink-0" />
                )}
                <span className="text-[11px] text-text-secondary truncate">{p.name}</span>
              </div>
            ))}
            {products.length > 3 && (
              <p className="text-[10px] text-text-muted">+{products.length - 3} more</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-text-muted/60">No products detected</p>
        )}
      </BentoCard>

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
                <span className="text-[11px] text-text-secondary">{p}</span>
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
        className="col-span-2"
      >
        {positioning ? (
          <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">{positioning}</p>
        ) : (
          <p className="text-xs text-text-muted/60">No positioning data</p>
        )}
      </BentoCard>
    </div>
  );
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
  return (
    <div className={`group relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 ${className}`}>
      <div className="min-h-[80px] mb-2">
        {children}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">{icon}</span>
          <span className="text-[11px] font-medium text-text-muted">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {verified && (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15">
              <Check size={8} className="text-emerald-400" />
            </div>
          )}
          {editable && (
            <button
              onClick={onEdit}
              className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-muted hover:text-text-primary transition-all cursor-pointer"
            >
              <Pencil size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
