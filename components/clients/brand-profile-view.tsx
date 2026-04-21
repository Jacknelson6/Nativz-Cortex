'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Building, Globe, Pencil, Sparkles, Megaphone, Users,
} from 'lucide-react';
import { BrandDNACards } from '@/components/brand-dna/brand-dna-cards';
import { BrandProfileSocialsView } from './brand-profile-socials-view';
import { BrandProfileCompetitorsView } from './brand-profile-competitors-view';

// NAT-57 follow-up (2026-04-21, polish pass 2): unified brand-profile
// view used by both `/admin/brand-profile` and `/portal/brand-profile`.
// Admin mode adds an "Edit in settings" CTA that deep-links to the edit
// surface; portal mode hides it.
//
// Layout change from pass 1: each section is now a self-contained card
// with its icon inside the card header (RankPrompt style), not in an
// above-card section header. All icons use the AC teal accent color
// (text-accent-text) rather than per-section hues — Jack flagged the
// pink/blue/purple palette as off-brand.
//
// Sections removed in this pass per Jack's feedback:
//   - Brand structure (products, services, aliases, categories) —
//     services is an internal activation state, not a client-facing
//     data point. Categories can live inside the header if needed.
//   - Content generation preferences — surfaced nowhere else, not
//     something the client needs to see.
// Kept: Essence, Social presence (linked + competitors), Brand DNA.

export interface BrandProfileData {
  id: string;
  name: string | null;
  slug: string | null;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
  industry: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  tagline: string | null;
  value_proposition: string | null;
  mission_statement: string | null;
  // Kept in the data shape so the caller queries don't have to change,
  // but not rendered in this view — the admin settings page still
  // edits + surfaces them.
  products: string[];
  services: string[];
  brand_aliases: string[];
  topic_keywords: string[];
  writing_style: string | null;
  ai_image_style: string | null;
  banned_phrases: string[];
  content_language: string | null;
  primary_country: string | null;
  primary_state: string | null;
  primary_city: string | null;
  created_at: string | null;
}

interface BrandProfileViewProps {
  profile: BrandProfileData;
  /** Brand DNA guideline metadata — drives the bento-grid cards at the bottom. */
  dnaMetadata: Record<string, unknown> | null;
  dnaUpdatedAt?: string | null;
  /** Admin-only edit deep link. Null in portal. */
  editHref?: string | null;
}

export function BrandProfileView({ profile, dnaMetadata, dnaUpdatedAt, editHref }: BrandProfileViewProps) {
  const hasEssence = !!(profile.tagline || profile.value_proposition || profile.mission_statement);

  return (
    <div className="space-y-4">
      {/* ─── Header ────────────────────────────────────────────────── */}
      <header className="rounded-xl border border-nativz-border bg-surface p-6">
        <div className="flex items-start gap-4">
          {profile.logo_url ? (
            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-background shrink-0">
              <Image
                src={profile.logo_url}
                alt={`${profile.name ?? 'Brand'} logo`}
                fill
                className="object-contain"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-lg bg-background/50 flex items-center justify-center shrink-0">
              <Building size={24} className="text-text-muted" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-text-primary truncate">
                  {profile.name ?? 'Brand profile'}
                </h1>
                {profile.website_url && (
                  <a
                    href={profile.website_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm text-accent-text hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    <Globe size={12} /> {cleanDomain(profile.website_url)}
                  </a>
                )}
              </div>
              {editHref && (
                <Link
                  href={editHref}
                  className="shrink-0 inline-flex items-center gap-1 text-xs rounded-full border border-nativz-border px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover transition"
                >
                  <Pencil size={12} /> Edit in settings
                </Link>
              )}
            </div>
            {profile.description && (
              <p className="text-sm text-text-secondary mt-3 leading-relaxed">
                {profile.description}
              </p>
            )}
          </div>
        </div>

        {(profile.industry || profile.target_audience || profile.brand_voice) && (
          <dl className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-nativz-border">
            {profile.industry && <Field label="Industry" value={profile.industry} />}
            {profile.brand_voice && <Field label="Brand voice" value={profile.brand_voice} />}
            {profile.target_audience && <Field label="Target audience" value={profile.target_audience} />}
          </dl>
        )}
      </header>

      {/* ─── Brand essence ────────────────────────────────────────── */}
      {hasEssence && (
        <SectionCard
          icon={<Sparkles size={16} />}
          title="Brand essence"
          description="Tagline, value prop, and mission — the brand's story in three beats."
        >
          <div className="space-y-4 pt-2">
            {profile.tagline && <EssenceRow label="Tagline" value={profile.tagline} large />}
            {profile.value_proposition && <EssenceRow label="Value proposition" value={profile.value_proposition} />}
            {profile.mission_statement && <EssenceRow label="Mission" value={profile.mission_statement} />}
          </div>
        </SectionCard>
      )}

      {/* ─── Social presence — linked profiles + competitors ──────── */}
      <SectionCard
        icon={<Megaphone size={16} />}
        title="Social presence"
        description="Linked accounts + brands we're benchmarking against."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2">
          <BrandProfileSocialsView clientId={profile.id} />
          <BrandProfileCompetitorsView clientId={profile.id} />
        </div>
      </SectionCard>

      {/* ─── Brand DNA — bento grid from the AI-distilled guideline ── */}
      {dnaMetadata && Object.keys(dnaMetadata).length > 0 && (
        <SectionCard
          icon={<Users size={16} />}
          title="Brand DNA"
          description="Auto-distilled visual + verbal identity."
          rightSlot={dnaUpdatedAt ? (
            <span className="text-[10px] text-text-muted">
              Updated {new Date(dnaUpdatedAt).toLocaleDateString()}
            </span>
          ) : null}
        >
          <div className="pt-2">
            <BrandDNACards metadata={dnaMetadata} clientId={profile.id} editable={false} />
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Presentation primitives ───────────────────────────────────────────

/**
 * Self-contained section card — icon + title + description live in the
 * card header, content below. Mirrors RankPrompt's "Brand Settings"
 * layout where each section stands alone as a tile.
 */
function SectionCard({
  icon, title, description, rightSlot, children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            {description && (
              <p className="text-xs text-text-muted mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </header>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
        {label}
      </dt>
      <dd className="text-sm text-text-primary mt-1 leading-relaxed">{value}</dd>
    </div>
  );
}

function EssenceRow({
  label, value, large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
        {label}
      </span>
      <p
        className={`mt-1.5 text-text-primary leading-relaxed ${
          large ? 'text-xl font-semibold' : 'text-sm'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function cleanDomain(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}
