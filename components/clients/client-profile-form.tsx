'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, Save, Sparkles, Loader2,
  Clock, Pencil, X, Settings2, ExternalLink, DollarSign,
  BookOpen, Lightbulb, Wand2, Plug, Palette,
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
import { KnowledgeThumbnail } from '@/components/knowledge/KnowledgeThumbnail';
import { ProfileField, SectionLabel } from './client-profile-fields';
import { ClientActivityCards } from './client-activity-cards';
import { PortalAccessCard, DangerZone } from './client-settings-section';
import { ImpersonateButton } from './impersonate-button';
import type { ClientStrategy } from '@/lib/types/strategy';
import type { ClientPreferences } from '@/lib/types/database';

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
  uppromote_api_key?: string | null;
  monthly_boosting_budget?: number | null;
}

export interface ClientProfileFormProps {
  client: ClientProfileData;
  portalContacts: Array<{ id: string; full_name: string; email: string; avatar_url: string | null; job_title: string | null; last_login: string | null }>;
  strategy: ClientStrategy | null;
  searches: Array<{ id: string; query: string; status: string; search_mode: string; created_at: string; approved_at: string | null }>;
  recentShoots: Array<{ id: string; title: string; shoot_date: string; location: string | null }>;
  recentMoodboards: Array<{ id: string; name: string; created_at: string; updated_at: string }>;
  ideas: Array<{ id: string; title: string; category: string; status: string; created_at: string; submitted_by: string | null }>;
  ideaCount: number;
  knowledgeSummary?: { type: string; count: number }[];
  inModal?: boolean;
}

export function ClientProfileForm({
  client,
  portalContacts,
  strategy: initialStrategy,
  searches,
  recentShoots,
  recentMoodboards,
  ideas,
  ideaCount,
  knowledgeSummary,
  inModal,
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
  const [services, setServices] = useState<string[]>(client.services ?? []);
  const [googleDriveBrandingUrl, setGoogleDriveBrandingUrl] = useState(client.google_drive_branding_url ?? '');
  const [googleDriveCalendarsUrl, setGoogleDriveCalendarsUrl] = useState(client.google_drive_calendars_url ?? '');

  const p = client.preferences;
  const [boostingBudget, setBoostingBudget] = useState(
    client.monthly_boosting_budget != null ? String(client.monthly_boosting_budget) : ''
  );

  const [editingBrand, setEditingBrand] = useState(false);
  const [editingLogo, setEditingLogo] = useState(false);

  const flags = client.feature_flags;
  const [canSearch, setCanSearch] = useState(flags?.can_search ?? true);
  const [canViewReports, setCanViewReports] = useState(flags?.can_view_reports ?? true);
  const [canEditPreferences, setCanEditPreferences] = useState(flags?.can_edit_preferences ?? false);
  const [canSubmitIdeas, setCanSubmitIdeas] = useState(flags?.can_submit_ideas ?? false);
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
      const payload = {
        industry,
        target_audience: targetAudience || null,
        brand_voice: brandVoice || null,
        topic_keywords: topicKeywords.split(',').map((k) => k.trim()).filter(Boolean),
        logo_url: logoUrl || null,
        website_url: websiteUrl.trim() || null,
        feature_flags: { can_search: canSearch, can_view_reports: canViewReports, can_edit_preferences: canEditPreferences, can_submit_ideas: canSubmitIdeas },
        preferences: p || {},
        monthly_boosting_budget: boostingBudget.trim() ? Number(boostingBudget.trim()) : null,
        is_active: isActive,
        services,
        health_score: null as string | null,
        agency: agency.trim() || null,
        description: description.trim() || null,
        google_drive_branding_url: googleDriveBrandingUrl.trim() || null,
        google_drive_calendars_url: googleDriveCalendarsUrl.trim() || null,
      };
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

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {!inModal && (
        <Breadcrumbs items={[
          { label: 'Clients', href: '/admin/clients' },
          { label: clientName },
        ]} />
      )}

      <form onSubmit={handleSave} noValidate className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {!inModal && (
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
                <h1 className="truncate text-2xl font-semibold text-text-primary">{clientName}</h1>
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

        {/* Quick navigation */}
        {!inModal && (
          <nav className="flex items-center gap-1 border-b border-nativz-border-light pb-3 -mt-2">
            <Link
              href={`/admin/clients/${slug}/knowledge`}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <BookOpen size={14} />
              Knowledge
            </Link>
            <Link
              href={`/admin/clients/${slug}/ideas`}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <Lightbulb size={14} />
              Ideas
            </Link>
            <Link
              href={`/admin/clients/${slug}/ad-creatives`}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <Palette size={14} />
              Ad creatives
            </Link>
            <Link
              href={`/admin/clients/${slug}/ideas/generate`}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <Wand2 size={14} />
              Idea generator
            </Link>
            <Link
              href={`/admin/clients/${slug}/settings`}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <Settings2 size={14} />
              Settings
            </Link>
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
                  setTopicKeywords((client.topic_keywords || []).join(', ')); setServices(client.services ?? []);
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
                  <label className="block text-sm font-medium text-text-secondary mb-2">Services</label>
                  <div className="flex flex-wrap gap-2">
                    {['SMM', 'Paid Media', 'Editing', 'Affiliates'].map((svc) => {
                      const active = services.includes(svc);
                      return (
                        <button key={svc} type="button" onClick={() => setServices((prev) => active ? prev.filter((s) => s !== svc) : [...prev, svc])} className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${active ? 'bg-accent/15 text-accent-text border border-accent/30 shadow-[0_0_8px_var(--focus-ring)]' : 'bg-surface-hover text-text-muted border border-nativz-border hover:border-nativz-border-light hover:text-text-secondary'}`}>
                          {svc}
                        </button>
                      );
                    })}
                  </div>
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
                  {services.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">{services.map((svc) => <Badge key={svc} variant="default">{svc}</Badge>)}</div>
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

      {/* Knowledge & Contacts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text-primary">Knowledge base</h2>
            <Link href={`/admin/clients/${slug}/knowledge`}>
              <Button size="sm" variant="outline">
                <BookOpen size={14} />
                View
              </Button>
            </Link>
          </div>
          {knowledgeSummary && knowledgeSummary.length > 0 ? (
            <Link href={`/admin/clients/${slug}/knowledge`} className="block group">
              <div className="rounded-lg overflow-hidden border border-nativz-border bg-background hover:border-accent/30 transition-all">
                <KnowledgeThumbnail nodes={knowledgeSummary.flatMap((item) => Array.from({ length: item.count }, () => ({ type: item.type })))} />
              </div>
              <div className="flex items-center gap-3 mt-2.5 px-0.5">
                {knowledgeSummary.slice(0, 4).map((item) => (
                  <span key={item.type} className="text-[11px] text-text-muted">
                    {item.count} {item.type.replace(/_/g, ' ')}{item.count !== 1 ? 's' : ''}
                  </span>
                ))}
              </div>
            </Link>
          ) : (
            <p className="text-sm text-text-muted">No knowledge entries yet.</p>
          )}
        </Card>
        <ClientContactsCard clientId={clientId} clientName={clientName} vaultContacts={[]} portalContacts={portalContacts} />
      </div>

      {/* Activity */}
      <SectionLabel icon={Clock} label="Activity" />
      <ClientActivityCards
        slug={slug}
        clientId={clientId}
        clientName={clientName}
        recentShoots={recentShoots}
        recentMoodboards={recentMoodboards}
        ideas={ideas}
        ideaCount={ideaCount}
        searches={searches}
      />

      {/* Integrations */}
      <SectionLabel icon={Plug} label="Integrations" />
      <ConnectedAccounts clientId={clientId} hasUpPromote={!!client.uppromote_api_key} />

      {/* Settings */}
      <SectionLabel icon={Settings2} label="Settings" />
      <PortalAccessCard
        clientId={clientId}
        canSearch={canSearch} setCanSearch={setCanSearch}
        canViewReports={canViewReports} setCanViewReports={setCanViewReports}
        canEditPreferences={canEditPreferences} setCanEditPreferences={setCanEditPreferences}
        canSubmitIdeas={canSubmitIdeas} setCanSubmitIdeas={setCanSubmitIdeas}
      />
      <DangerZone clientId={clientId} clientName={clientName} isActive={isActive} setIsActive={setIsActive} />
    </div>
  );
}
