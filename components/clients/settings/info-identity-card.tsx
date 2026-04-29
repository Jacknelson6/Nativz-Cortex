'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, Pencil } from 'lucide-react';
import { InfoCard, InfoField, InfoFieldGrid } from './info-card';
import { ClientLogo } from '@/components/clients/client-logo';
import { ImageUpload } from '@/components/ui/image-upload';

/**
 * InfoIdentityCard — the "who is this" card on /admin/clients/[slug]/settings/info.
 * Read-first per the portal-brand-profile card pattern; pencil flips the whole
 * card into edit mode where the admin can adjust name, logo, website, industry, agency.
 * Slug stays stable (URL-bearing) so it isn't editable here — rename flows
 * through Danger zone if a slug change is genuinely needed.
 */

type IdentityPayload = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  website_url: string | null;
  agency: string | null;
  logo_url: string | null;
};

const AGENCIES = ['Nativz', 'Anderson Collaborative'] as const;

export function InfoIdentityCard({
  slug,
  initialClient,
}: {
  slug: string;
  /** SSR-fetched client row. When provided, skips the initial client fetch and
   *  hydrates drafts from it — dedupes the round-trip when the page server
   *  component already has the same data. */
  initialClient?: IdentityPayload;
}) {
  const router = useRouter();
  const [client, setClient] = useState<IdentityPayload | null>(initialClient ?? null);
  const [loading, setLoading] = useState(!initialClient);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit-state drafts; reset on Cancel or on remount after a save.
  const [name, setName] = useState(initialClient?.name ?? '');
  const [industry, setIndustry] = useState(initialClient?.industry ?? '');
  const [website, setWebsite] = useState(initialClient?.website_url ?? '');
  const [agency, setAgency] = useState(initialClient?.agency ?? '');
  const [logoUrl, setLogoUrl] = useState<string | null>(initialClient?.logo_url ?? null);

  useEffect(() => {
    if (initialClient) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as { error?: string }).error || 'Failed to load client');
        }
        const d = (await res.json()) as { client: IdentityPayload };
        if (cancelled) return;
        setClient(d.client);
        setName(d.client.name ?? '');
        setIndustry(d.client.industry ?? '');
        setWebsite(d.client.website_url ?? '');
        setAgency(d.client.agency ?? '');
        setLogoUrl(d.client.logo_url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, initialClient]);

  function resetDrafts(from: IdentityPayload) {
    setName(from.name ?? '');
    setIndustry(from.industry ?? '');
    setWebsite(from.website_url ?? '');
    setAgency(from.agency ?? '');
    setLogoUrl(from.logo_url);
  }

  const dirty = !!client && (
    name.trim() !== (client.name ?? '') ||
    (industry.trim() || null) !== (client.industry ?? null) ||
    (website.trim() || null) !== (client.website_url ?? null) ||
    (agency.trim() || null) !== (client.agency ?? null) ||
    logoUrl !== (client.logo_url ?? null)
  );

  async function handleSave() {
    if (!client) return;
    setSaving(true);
    try {
      const trimmedName = name.trim();
      if (!trimmedName) {
        toast.error('Name cannot be empty');
        return;
      }
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          industry: industry.trim() || null,
          website_url: website.trim() || null,
          agency: agency.trim() || null,
          logo_url: logoUrl,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to save');
        return;
      }
      const next: IdentityPayload = {
        ...client,
        name: trimmedName,
        industry: industry.trim() || null,
        website_url: website.trim() || null,
        agency: agency.trim() || null,
        logo_url: logoUrl,
      };
      setClient(next);
      setEditing(false);
      toast.success('Identity saved');
      router.refresh();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <InfoCard icon={<Building2 size={16} />} title="Identity">
        <p className="text-sm text-red-400">{error}</p>
      </InfoCard>
    );
  }

  if (loading || !client) {
    return (
      <InfoCard icon={<Building2 size={16} />} title="Identity">
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="h-24 w-24 rounded-full bg-surface-hover animate-pulse" />
          <div className="h-5 w-48 bg-surface-hover rounded animate-pulse" />
        </div>
      </InfoCard>
    );
  }

  const abbreviation = client.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <InfoCard
      icon={<Building2 size={16} />}
      title="Identity"
      description="Core fingerprint — logo, website, industry, and the agency running this client."
      state={editing ? 'edit' : 'read'}
      edit={{ onClick: () => setEditing(true) }}
      cancel={{
        onClick: () => { resetDrafts(client); setEditing(false); },
        disabled: saving,
      }}
      save={{
        onClick: handleSave,
        loading: saving,
        dirty,
      }}
    >
      <div className="flex flex-col items-center gap-4 py-2">
        {editing ? (
          <div className="shrink-0">
            <ImageUpload value={logoUrl} onChange={setLogoUrl} size="lg" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group relative shrink-0 rounded-full transition-all hover:ring-2 hover:ring-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
            title="Edit logo"
            aria-label="Edit client logo and identity"
          >
            <ClientLogo
              src={client.logo_url}
              name={client.name}
              abbreviation={abbreviation}
              size="xl"
              noBacking
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
              <Pencil size={16} className="text-white" />
            </div>
          </button>
        )}

        <div className="w-full max-w-sm">
          {editing ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client name"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-center text-base font-semibold text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
            />
          ) : (
            <p className="text-center text-lg font-semibold text-text-primary truncate">
              {client.name}
            </p>
          )}
        </div>
      </div>

      <InfoFieldGrid columns={3}>
        {editing ? (
          <>
            <EditField label="Website" value={website} onChange={setWebsite} placeholder="https://example.com" />
            <EditField label="Industry" value={industry} onChange={setIndustry} placeholder="e.g. Coworking" />
            <SelectField
              label="Agency"
              value={agency}
              onChange={setAgency}
              options={AGENCIES}
              placeholder="Select agency…"
            />
          </>
        ) : (
          <>
            <InfoField label="Website" value={client.website_url} isLink />
            <InfoField label="Industry" value={client.industry} />
            <InfoField label="Agency" value={client.agency} />
          </>
        )}
      </InfoFieldGrid>
    </InfoCard>
  );
}

function EditField({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors cursor-pointer appearance-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.75rem center',
          paddingRight: '2rem',
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
