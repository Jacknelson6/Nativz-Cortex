'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MapPin } from 'lucide-react';
import { InfoCard, InfoField, InfoFieldGrid } from './info-card';

/**
 * InfoBrandLocationCard — country / state / city. Read-first with a single
 * Cancel/Save covering the trio. State + city are disabled in edit mode until
 * a country is set (matches the DB-side check constraint).
 */

type Location = {
  primary_country: string | null;
  primary_state: string | null;
  primary_city: string | null;
};

export function InfoBrandLocationCard({
  clientId,
  initial,
}: {
  clientId: string;
  initial: Location;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<Location>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [country, setCountry] = useState(initial.primary_country ?? '');
  const [state, setState] = useState(initial.primary_state ?? '');
  const [city, setCity] = useState(initial.primary_city ?? '');

  const dirty =
    (country.trim() || null) !== (saved.primary_country ?? null) ||
    (state.trim() || null) !== (saved.primary_state ?? null) ||
    (city.trim() || null) !== (saved.primary_city ?? null);

  function reset() {
    setCountry(saved.primary_country ?? '');
    setState(saved.primary_state ?? '');
    setCity(saved.primary_city ?? '');
  }

  async function handleSave() {
    // Mirrored from the API's check: state/city require country.
    if (!country.trim() && (state.trim() || city.trim())) {
      toast.error('Country is required when state or city is set.');
      return;
    }
    setSaving(true);
    try {
      const body: Location = {
        primary_country: country.trim() || null,
        primary_state: state.trim() || null,
        primary_city: city.trim() || null,
      };
      const res = await fetch(`/api/clients/${clientId}/brand-profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to save');
        return;
      }
      setSaved(body);
      setEditing(false);
      toast.success('Default location saved');
      router.refresh();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <InfoCard
      icon={<MapPin size={16} />}
      title="Default location"
      description="Geo-frame content (language, references, regional trends). Country-only is fine for national brands; add state and city for local."
      state={editing ? 'edit' : 'read'}
      edit={{ onClick: () => setEditing(true) }}
      cancel={{
        onClick: () => { reset(); setEditing(false); },
        disabled: saving,
      }}
      save={{ onClick: handleSave, loading: saving, dirty }}
    >
      {editing ? (
        <InfoFieldGrid columns={3} withDivider={false}>
          <EditField label="Country" value={country} onChange={setCountry} placeholder="United States" />
          <EditField
            label="State / region"
            value={state}
            onChange={setState}
            placeholder="California"
            disabled={!country.trim()}
          />
          <EditField
            label="City"
            value={city}
            onChange={setCity}
            placeholder="Los Angeles"
            disabled={!country.trim()}
          />
        </InfoFieldGrid>
      ) : (
        <InfoFieldGrid columns={3} withDivider={false}>
          <InfoField label="Country" value={saved.primary_country} emptyLabel="No country set" />
          <InfoField label="State / region" value={saved.primary_state} emptyLabel="—" />
          <InfoField label="City" value={saved.primary_city} emptyLabel="—" />
        </InfoFieldGrid>
      )}
    </InfoCard>
  );
}

function EditField({
  label, value, onChange, placeholder, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
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
        disabled={disabled}
        className="mt-1.5 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40 transition-colors"
      />
    </div>
  );
}
