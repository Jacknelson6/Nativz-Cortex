'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, Save, Sparkles, Loader2,
  Pencil, X, Settings2, ExternalLink, DollarSign,
  BookOpen, Lightbulb, Wand2, Plug, Palette, Dna,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { ImageUpload } from '@/components/ui/image-upload';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { AgencyBadge } from '@/components/clients/agency-badge';
import { ClientContactsCard } from '@/components/clients/client-contacts-card';
import { ClientStrategyCard } from '@/components/clients/client-strategy-card';
import { ConnectedAccounts } from '@/components/clients/connected-accounts';
import { ProfileField, SectionLabel } from './client-profile-fields';
import { PortalAccessCard, DangerZone } from './client-settings-section';
import { ImpersonateButton } from './impersonate-button';
import type { ClientStrategy } from '@/lib/types/strategy';
import type { ClientPreferences } from '@/lib/types/database';
import { isAdminWorkspaceNavVisible } from '@/lib/clients/admin-workspace-modules';
import type { AdminWorkspaceToggleKey } from '@/lib/clients/admin-workspace-modules';

type HealthScore = 'not_good' | 'fair' | 'good' | 'great' | 'excellent';

export interface ClientProfileData {
  id: string;
  name: string;
  slug: string;
  industry: string;
  organization_id: string | null;
  logo_url: string | null;
  website_url: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  topic_keywords: string[] | null;
  is_active: boolean;
  feature_flags: {
    can_search?: boolean;
    can_view_reports?: boolean;
    can_edit_preferences?: boolean;
    can_submit_ideas?: boolean;
  } | null;
  health_score: HealthScore | null;
  agency: string | null;
  services: string[] | null;
  description: string | null;
  google_drive_branding_url: string | null;
  google_drive_calendars_url: string | null;
  preferences: ClientPreferences | null;
  has_affiliate_integration?: boolean;
  affiliate_digest_email_enabled?: boolean;
  affiliate_digest_recipients?: string | null;
  monthly_boosting_budget?: number | null;
  admin_workspace_modules?: Record<AdminWorkspaceToggleKey, boolean> | null;
}

export interface ClientProfileFormProps {
  client: ClientProfileData;
  portalContacts: Array<{ id: string; full_name: string; email: string; avatar_url: string | null; job_title: string | null; last_login: string | null }>;
  strategy: ClientStrategy | null;
  inModal?: boolean;
  /** Full-page client workspace (sidebar layout) — hide back link and horizontal section nav. */
  embeddedInShell?: boolean;
}

export function ClientProfileForm({
  client,
  portalContacts,
  strategy: initialStrategy,
  inModal,
  embeddedInShell,
}: ClientProfileFormProps) {
  const slug = client.slug;
  const clientId = client.id;

  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const [clientName] = useState(client.name);
  const [logoUrl, setLogoUrl] = useState<string | null>(client.logo_url);

  const [industry, setIndustry] = useState(client.industry || '');
  const [websiteUrl, setWebsiteUrl] = useState(client.website_url || '');
  const [targetAudience, setTargetAudience] = useState(client.target_audience || '');
  const [brandVoice, setBrandVoice] = useState(client.brand_voice || '');
  const [topicKeywords, setTopicKeywords] = useState((client.topic_keywords || []).join(', '));
  const [description, setDescription] = useState(client.description ?? '');

  const [agency, setAgency] = useState(client.agency ?? '');
  const [googleDriveBrandingUrl, setGoogleDriveBrandingUrl] = useState(client.google_drive_branding_url ?? '');
  const [googleDriveCalendarsUrl, setGoogleDriveCalendarsUrl] = useState(client.google_drive_calendars_url ?? '');

  const p = client.preferences;
  const [boostingBudget, setBoostingBudget] = useState(
    client.monthly_boosting_budget != null ? String(client.monthly_boosting_budget) : ''
  );

  const [editingBrand, setEditingBrand] = useState(false);
  const [editingLogo, setEditingLogo] = useState(false);

  const [isActive, setIsActive] = useState(client.is_active);

  const abbreviation = clientName
    .split(/\s+/)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  async function handleGenerateAI() {
    const url = websiteUrl.trim();
    if (!url) { toast.error('Enter a website URL first.'); return; }
    setAnalyzing(true);
    try {
      const res = await fetch('/api/clients/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed to analyze website.'); return; }
      const data = await res.json();
      if (data.industry) setIndustry(data.industry);
      if (data.target_audience) setTargetAudience(data.target_audience);
      if (data.brand_voice) setBrandVoice(data.brand_voice);
      if (data.topic_keywords) setTopicKeywords(data.topic_keywords.join(', '));
      if (data.logo_url && !logoUrl) setLogoUrl(data.logo_url);
      toast.success('Fields generated from website.');
    } catch { toast.error('Something went wrong. Try again.'); }
    finally { setAnalyzing(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        industry,
        target_audience: targetAudience || null,
        brand_voice: brandVoice || null,
        topic_keywords: topicKeywords.split(',').map((k) => k.trim()).filter(Boolean),
        logo_url: logoUrl || null,
        website_url: websiteUrl.trim() || null,
        preferences: p || {},
        monthly_boosting_budget: boostingBudget.trim() ? Number(boostingBudget.trim()) : null,
        health_score: null as string | null,
        agency: agency.trim() || null,
        description: description.trim() || null,
        google_drive_branding_url: googleDriveBrandingUrl.trim() || null,
        google_drive_calendars_url: googleDriveCalendarsUrl.trim() || null,
      };
      if (!embeddedInShell) {
        payload.is_active = isActive;
      }
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed to save.'); }
      else { toast.success('Saved.'); setEditingBrand(false); }
    } catch { toast.error('Something went wrong. Try again.'); }
    finally { setSaving(false); }
  }

  const showBreadcrumbs = !inModal && !embeddedInShell;
  const showBackLink = !inModal && !embeddedInShell;
  const showQuickNav = !embeddedInShell;

  return (
    <div className="cortex-page-gutter space-y-8 max-w-5xl mx-auto">
      {showBreadcrumbs && (
        <Breadcrumbs items={[
          { label: 'Clients', href: '/admin/clients' },
          { label: clientName },
        ]} />
      )}

      <form onSubmit={handleSave} noValidate className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {showBackLink && (
              <Link href="/admin/clients" className="shrink-0 text-text-muted hover:text-text-secondary transition-colors mt-1">
                <ArrowLeft size={20} />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setEditingLogo(!editingLogo)}
              className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-hover/50 border border-nativz-border-light transition-all hover:border-accent/40 cursor-pointer"
            >
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoUrl} alt={clientName} className="h-full w-full object-contain p-2" />
              ) : (
                <div className="text-lg font-bold text-accent-text">
                  {abbreviation || <Building2 size={24} />}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                <Pencil size={14} className="text-white" />
              </div>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="truncate ui-page-title">{clientName}</h1>
                <AgencyBadge agency={agency} />
                {client.organization_id && (
                  <ImpersonateButton organizationId={client.organization_id} clientSlug={slug} />
                )}
              </div>
              <p className="truncate text-sm text-text-muted mt-0.5">
                {industry || 'General'}
                {websiteUrl && (
                  <>
                    {' · '}
                    <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline inline-flex items-center gap-0.5">
                      {websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                      <ExternalLink size={10} />
                    </a>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {showQuickNav && (
          <nav
            className={`flex flex-wrap items-center gap-1 border-b border-nativz-border-light pb-3 -mt-2 ${inModal ? 'pt-1' : ''}`}
            aria-label="Client sections"
          >
            {(
              [
                {
                  key: 'brand-dna',
                  href: `/admin/clients/${slug}/brand-dna`,
                  label: 'Brand DNA',
                  Icon: Dna,
                  variant: 'accent' as const,
                },
                {
                  key: 'knowledge',
                  href: `/admin/clients/${slug}/knowledge`,
                  label: 'Knowledge',
                  Icon: BookOpen,
                  variant: 'default' as const,
                },
                {
                  key: 'ideas',
                  href: `/admin/clients/${slug}/ideas`,
                  label: 'Ideas',
                  Icon: Lightbulb,
                  variant: 'default' as const,
                },
                {
                  key: 'ad-creatives',
                  href: `/admin/clients/${slug}/ad-creatives`,
                  label: 'Ad creatives',
                  Icon: Palette,
                  variant: 'default' as const,
                },
                {
                  key: 'idea-generator',
                  href: `/admin/clients/${slug}/ideas/generate`,
                  label: 'Idea generator',
                  Icon: Wand2,
                  variant: 'default' as const,
                },
                {
                  key: 'settings',
                  href: `/admin/clients/${slug}/settings`,
                  label: 'Settings',
                  Icon: Settings2,
                  variant: 'default' as const,
                },
              ] as const
            )
              .filter((item) => isAdminWorkspaceNavVisible(client.admin_workspace_modules, item.key))
              .map((item) => {
                const Icon = item.Icon;
                const className =
                  item.variant === 'accent'
                    ? 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-accent-text bg-accent-surface/25 border border-accent-border/35 hover:bg-accent-surface/45 transition-colors'
                    : 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors';
                return (
                  <Link key={item.key} href={item.href} className={className}>
                    <Icon size={14} />
                    {item.label}
                  </Link>
                );
              })}
          </nav>
        )}

        {editingLogo && (
          <Card className="max-w-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-primary">Logo</h3>
              <Button type="button" variant="ghost" size="xs" onClick={() => setEditingLogo(false)}>
                <X size={12} />
              </Button>
            </div>
            <ImageUpload value={logoUrl} onChange={setLogoUrl} size="lg" />
          </Card>
        )}

        {/* Brand profile */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">Brand profile</h2>
            {!editingBrand ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingBrand(true)}>
                <Pencil size={14} />
                Edit
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => {
                  setWebsiteUrl(client.website_url || ''); setDescription(client.description ?? '');
                  setTargetAudience(client.target_audience || ''); setBrandVoice(client.brand_voice || '');
                  setTopicKeywords((client.topic_keywords || []).join(', '));
                  setIndustry(client.industry || ''); setAgency(client.agency ?? '');
                  setGoogleDriveBrandingUrl(client.google_drive_branding_url ?? '');
                  setGoogleDriveCalendarsUrl(client.google_drive_calendars_url ?? '');
                  setBoostingBudget(client.monthly_boosting_budget != null ? String(client.monthly_boosting_budget) : ''); setEditingBrand(false);
                }}>
                  <X size={14} />
                  Cancel
                </Button>
                {websiteUrl.trim() && (
                  <Button variant="outline" size="sm" onClick={handleGenerateAI} disabled={analyzing} type="button">
                    {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {analyzing ? 'Analyzing...' : 'Generate with AI'}
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={saving}>
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </div>

          {editingBrand ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input id="website_url" label="Website" type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" />
                <Input id="industry" label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
                <div className="space-y-1.5">
                  <label htmlFor="agency" className="block text-sm font-medium text-text-secondary">Agency</label>
                  <select id="agency" value={agency} onChange={(e) => setAgency(e.target.value)} className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer appearance-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center' }}>
                    <option value="">Select agency...</option>
                    <option value="Nativz">Nativz</option>
                    <option value="Anderson Collaborative">Anderson Collaborative</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Textarea id="target_audience" label="Target audience" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Describe the target audience..." rows={3} />
                <Textarea id="brand_voice" label="Brand voice" value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} placeholder="Describe the brand voice and tone..." rows={3} />
              </div>
              <Input id="topic_keywords" label="Topic keywords (comma-separated)" value={topicKeywords} onChange={(e) => setTopicKeywords(e.target.value)} placeholder="fitness, nutrition, wellness" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span className="block text-sm font-medium text-text-secondary mb-2">Services</span>
                  <p className="text-xs text-text-muted mb-2">
                    Contracted services, portal features, and admin sidebar modules are configured in Settings.
                  </p>
                  <Link
                    href={`/admin/clients/${slug}/settings`}
                    className="text-sm font-medium text-accent-text hover:underline"
                  >
                    Open access & services
                  </Link>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Boosting budget</label>
                  <div className="relative">
                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input type="text" value={boostingBudget} onChange={(e) => setBoostingBudget(e.target.value)} placeholder="e.g. 500/mo, 2000/mo" className="block w-full rounded-lg border border-nativz-border bg-surface pl-8 pr-3 py-2 text-sm text-text-primary placeholder-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input id="google_drive_branding_url" label="Google Drive — branding assets" type="url" value={googleDriveBrandingUrl} onChange={(e) => setGoogleDriveBrandingUrl(e.target.value)} placeholder="https://drive.google.com/..." />
                <Input id="google_drive_calendars_url" label="Google Drive — content calendars" type="url" value={googleDriveCalendarsUrl} onChange={(e) => setGoogleDriveCalendarsUrl(e.target.value)} placeholder="https://drive.google.com/..." />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ProfileField label="Target audience" value={targetAudience} />
                <ProfileField label="Brand voice" value={brandVoice} />
              </div>
              <ProfileField label="Topic keywords" value={topicKeywords} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <span className="block text-xs font-medium text-text-muted mb-1.5">Services</span>
                  {(client.services ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">{(client.services ?? []).map((svc) => <Badge key={svc} variant="default">{svc}</Badge>)}</div>
                  ) : (
                    <p className="text-sm text-text-muted italic">Not set</p>
                  )}
                </div>
                <ProfileField label="Boosting budget" value={client.monthly_boosting_budget ? `$${client.monthly_boosting_budget.toLocaleString()}/mo` : boostingBudget ? `$${boostingBudget}` : ''} />
                <div className="space-y-2">
                  <span className="block text-xs font-medium text-text-muted mb-0.5">Resources</span>
                  {googleDriveBrandingUrl && <a href={googleDriveBrandingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-accent-text hover:underline"><ExternalLink size={10} />Branding assets</a>}
                  {googleDriveCalendarsUrl && <a href={googleDriveCalendarsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-accent-text hover:underline"><ExternalLink size={10} />Content calendars</a>}
                  {!googleDriveBrandingUrl && !googleDriveCalendarsUrl && <p className="text-sm text-text-muted italic">Not set</p>}
                </div>
              </div>
            </div>
          )}
        </Card>

      </form>

      <ClientContactsCard clientId={clientId} clientName={clientName} vaultContacts={[]} portalContacts={portalContacts} />

      {/* Integrations + portal admin — sidebar Settings when using client workspace */}
      {!embeddedInShell && (
        <>
          <SectionLabel icon={Plug} label="Integrations" />
          <ConnectedAccounts
            clientId={clientId}
            hasAffiliateIntegration={client.has_affiliate_integration}
          />

          <SectionLabel icon={Settings2} label="Settings" />
          <PortalAccessCard clientId={clientId} />
          <DangerZone clientId={clientId} clientName={clientName} isActive={isActive} setIsActive={setIsActive} />
        </>
      )}
    </div>
  );
}
