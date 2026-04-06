'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

interface PortalSettingsFormProps {
  userId: string;
  initialName: string;
  initialEmail: string;
  clientId: string;
  initialIndustry: string;
  initialTargetAudience: string;
  initialBrandVoice: string;
  initialTopicKeywords: string[];
  companyName: string;
}

function InlineField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="text-sm text-text-muted">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-y"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
      )}
    </div>
  );
}

export function PortalSettingsForm({
  initialName,
  initialEmail,
  clientId,
  initialIndustry,
  initialTargetAudience,
  initialBrandVoice,
  initialTopicKeywords,
  companyName,
}: PortalSettingsFormProps) {
  // Account
  const [name, setName] = useState(initialName);
  const [savingAccount, setSavingAccount] = useState(false);

  // Brand profile
  const [industry, setIndustry] = useState(initialIndustry);
  const [targetAudience, setTargetAudience] = useState(initialTargetAudience);
  const [brandVoice, setBrandVoice] = useState(initialBrandVoice);
  const [keywordsText, setKeywordsText] = useState(initialTopicKeywords.join(', '));
  const [savingBrand, setSavingBrand] = useState(false);

  async function saveAccount() {
    setSavingAccount(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name }),
      });
      if (res.ok) {
        toast.success('Account updated');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingAccount(false);
    }
  }

  async function saveBrandProfile() {
    setSavingBrand(true);
    try {
      const topic_keywords = keywordsText
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry,
          target_audience: targetAudience,
          brand_voice: brandVoice,
          topic_keywords,
        }),
      });
      if (res.ok) {
        toast.success('Brand profile updated');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingBrand(false);
    }
  }

  return (
    <>
      {/* Account */}
      <Card>
        <h2 className="text-base font-semibold text-text-primary mb-4">Account</h2>
        <div className="space-y-3">
          <InlineField label="Name" value={name} onChange={setName} />
          <div>
            <p className="text-sm text-text-muted">Email</p>
            <p className="text-sm font-medium text-text-primary mt-1">{initialEmail}</p>
          </div>
        </div>
        <button
          onClick={saveAccount}
          disabled={savingAccount || name === initialName}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingAccount ? 'Saving...' : 'Save'}
        </button>
      </Card>

      {/* Brand profile */}
      <Card>
        <h2 className="text-base font-semibold text-text-primary mb-4">Brand profile</h2>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-text-muted">Company</p>
            <p className="text-sm font-medium text-text-primary mt-1">{companyName}</p>
          </div>
          <InlineField label="Industry" value={industry} onChange={setIndustry} />
          <InlineField
            label="Target audience"
            value={targetAudience}
            onChange={setTargetAudience}
            multiline
          />
          <InlineField label="Brand voice" value={brandVoice} onChange={setBrandVoice} />
          <div>
            <label className="text-sm text-text-muted">Topic keywords</label>
            <p className="text-xs text-text-muted/60 mt-0.5">Separate with commas</p>
            <input
              type="text"
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>
        </div>
        <button
          onClick={saveBrandProfile}
          disabled={savingBrand}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingBrand ? 'Saving...' : 'Save'}
        </button>
      </Card>
    </>
  );
}
