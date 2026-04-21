'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Building, Globe, Pencil, Sparkles, Target, Megaphone, Palette,
  Languages, MapPin, BadgeCheck, Tag, Package, Wrench,
} from 'lucide-react';
import { BrandDNACards } from '@/components/brand-dna/brand-dna-cards';
import { BrandProfileSocialsView } from './brand-profile-socials-view';
import { BrandProfileCompetitorsView } from './brand-profile-competitors-view';

// NAT-57 follow-up: unified brand-profile view used by both
// `/admin/brand-profile` and `/portal/brand-profile`. Admin mode adds
// an "Edit in settings" CTA that deep-links to the edit surface;
// portal mode hides it. Everything else is identical so we're not
// maintaining two render trees for the same data.

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

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', sv: 'Swedish', pl: 'Polish', tr: 'Turkish',
  ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ar: 'Arabic',
};

export function BrandProfileView({ profile, dnaMetadata, dnaUpdatedAt, editHref }: BrandProfileViewProps) {
  const hasEssence = !!(profile.tagline || profile.value_proposition || profile.mission_statement);
  const hasLocation = !!profile.primary_country;
  const hasContentGen = !!(profile.writing_style || profile.ai_image_style || profile.brand_voice || (profile.banned_phrases?.length ?? 0) > 0);
  const hasStructure = (profile.products?.length ?? 0) > 0 || (profile.services?.length ?? 0) > 0 || (profile.brand_aliases?.length ?? 0) > 0 || (profile.topic_keywords?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
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
        <Section icon={<Sparkles size={14} className="text-amber-400" />} title="Brand essence">
          <div className="grid grid-cols-1 gap-3">
            {profile.tagline && (
              <EssenceCard
                label="Tagline"
                value={profile.tagline}
                scale="large"
              />
            )}
            {profile.value_proposition && (
              <EssenceCard
                label="Value proposition"
                value={profile.value_proposition}
              />
            )}
            {profile.mission_statement && (
              <EssenceCard
                label="Mission"
                value={profile.mission_statement}
              />
            )}
          </div>
        </Section>
      )}

      {/* ─── Brand structure — products/services/aliases/cats ──────── */}
      {hasStructure && (
        <Section icon={<Target size={14} className="text-sky-400" />} title="Brand structure">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {profile.products.length > 0 && (
              <TagCard icon={<Package size={12} />} label="Products" tags={profile.products} />
            )}
            {profile.services.length > 0 && (
              <TagCard icon={<Wrench size={12} />} label="Services" tags={profile.services} />
            )}
            {profile.brand_aliases.length > 0 && (
              <TagCard icon={<BadgeCheck size={12} />} label="Brand aliases" tags={profile.brand_aliases} />
            )}
            {profile.topic_keywords.length > 0 && (
              <TagCard icon={<Tag size={12} />} label="Categories" tags={profile.topic_keywords} />
            )}
          </div>
        </Section>
      )}

      {/* ─── Social presence ──────────────────────────────────────── */}
      <Section icon={<Megaphone size={14} className="text-pink-400" />} title="Social presence">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <BrandProfileSocialsView clientId={profile.id} />
          <BrandProfileCompetitorsView clientId={profile.id} />
        </div>
      </Section>

      {/* ─── Content generation prefs ─────────────────────────────── */}
      {hasContentGen && (
        <Section icon={<Palette size={14} className="text-purple-400" />} title="Content generation preferences">
          <div className="rounded-xl border border-nativz-border bg-surface p-6 space-y-4">
            {profile.brand_voice && (
              <PrefBlock label="Tone of voice" value={profile.brand_voice} />
            )}
            {profile.writing_style && (
              <PrefBlock label="Writing style" value={profile.writing_style} />
            )}
            {profile.ai_image_style && (
              <PrefBlock label="AI image style" value={profile.ai_image_style} />
            )}
            {profile.content_language && (
              <div>
                <MiniLabel><Languages size={10} /> Content language</MiniLabel>
                <p className="text-sm text-text-primary mt-1">
                  {LANGUAGE_LABELS[profile.content_language] ?? profile.content_language}
                </p>
              </div>
            )}
            {profile.banned_phrases.length > 0 && (
              <div>
                <MiniLabel>Banned phrases</MiniLabel>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {profile.banned_phrases.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-300"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ─── Default location ─────────────────────────────────────── */}
      {hasLocation && (
        <Section icon={<MapPin size={14} className="text-emerald-400" />} title="Default location">
          <div className="rounded-xl border border-nativz-border bg-surface p-6">
            <p className="text-lg font-medium text-text-primary">
              {[profile.primary_city, profile.primary_state, profile.primary_country]
                .filter(Boolean)
                .join(', ')}
            </p>
            <p className="text-xs text-text-muted mt-1">
              Used for geo-framing content generation and trend context.
            </p>
          </div>
        </Section>
      )}

      {/* ─── Brand DNA — bento grid from the AI-distilled guideline ── */}
      {dnaMetadata && Object.keys(dnaMetadata).length > 0 && (
        <Section
          icon={<Sparkles size={14} className="text-accent-text" />}
          title="Brand DNA"
          rightSlot={dnaUpdatedAt ? (
            <span className="text-[10px] text-text-muted">
              Updated {new Date(dnaUpdatedAt).toLocaleDateString()}
            </span>
          ) : null}
        >
          <BrandDNACards metadata={dnaMetadata} clientId={profile.id} editable={false} />
        </Section>
      )}
    </div>
  );
}

// ─── Presentation primitives ───────────────────────────────────────────

function Section({
  icon, title, rightSlot, children,
}: {
  icon: React.ReactNode;
  title: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary inline-flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {rightSlot}
      </header>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <MiniLabel>{label}</MiniLabel>
      <dd className="text-sm text-text-primary mt-1 leading-relaxed">{value}</dd>
    </div>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-[10px] uppercase tracking-wider text-text-muted font-semibold inline-flex items-center gap-1">
      {children}
    </dt>
  );
}

function EssenceCard({
  label, value, scale = 'normal',
}: {
  label: string;
  value: string;
  scale?: 'normal' | 'large';
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <MiniLabel>{label}</MiniLabel>
      <p
        className={`mt-2 text-text-primary leading-relaxed ${
          scale === 'large' ? 'text-xl font-semibold' : 'text-sm'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TagCard({
  icon, label, tags,
}: {
  icon: React.ReactNode;
  label: string;
  tags: string[];
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <MiniLabel>
        {icon} {label}
      </MiniLabel>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center rounded-full bg-background/60 border border-nativz-border px-2 py-0.5 text-xs text-text-secondary"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function PrefBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <MiniLabel>{label}</MiniLabel>
      <p className="text-sm text-text-primary mt-1 leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function cleanDomain(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}
