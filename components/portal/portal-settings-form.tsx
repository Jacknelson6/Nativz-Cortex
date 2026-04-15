'use client';

import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  /** Hide the Account card — used when an admin is impersonating so the
   *  admin's own name/email doesn't show under a client-branded settings
   *  page. Brand profile still renders for the resolved portal client. */
  hideAccountCard?: boolean;
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-text-muted">{label}</p>
      <p className="text-sm font-medium text-text-primary">{value || 'Not set'}</p>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-sm text-text-muted">{label}</label>
      {hint && <p className="text-xs text-text-muted/60 mt-0.5">{hint}</p>}
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

function SectionHeader({
  title,
  editing,
  onEdit,
  onCancel,
}: {
  title: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      {editing ? (
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <X size={14} />
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-accent-text transition-colors"
        >
          <Pencil size={12} />
          Edit
        </button>
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
  hideAccountCard = false,
}: PortalSettingsFormProps) {
  // Account
  const [editingAccount, setEditingAccount] = useState(false);
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [savingAccount, setSavingAccount] = useState(false);

  // Brand profile
  const [editingBrand, setEditingBrand] = useState(false);
  const [industry, setIndustry] = useState(initialIndustry);
  const [targetAudience, setTargetAudience] = useState(initialTargetAudience);
  const [brandVoice, setBrandVoice] = useState(initialBrandVoice);
  const [keywordsText, setKeywordsText] = useState(initialTopicKeywords.join(', '));
  const [savedBrand, setSavedBrand] = useState({
    industry: initialIndustry,
    targetAudience: initialTargetAudience,
    brandVoice: initialBrandVoice,
    keywordsText: initialTopicKeywords.join(', '),
  });
  const [savingBrand, setSavingBrand] = useState(false);

  function cancelAccount() {
    setName(savedName);
    setEditingAccount(false);
  }

  function cancelBrand() {
    setIndustry(savedBrand.industry);
    setTargetAudience(savedBrand.targetAudience);
    setBrandVoice(savedBrand.brandVoice);
    setKeywordsText(savedBrand.keywordsText);
    setEditingBrand(false);
  }

  async function saveAccount() {
    setSavingAccount(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name }),
      });
      if (res.ok) {
        setSavedName(name);
        setEditingAccount(false);
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
        setSavedBrand({ industry, targetAudience, brandVoice, keywordsText });
        setEditingBrand(false);
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

  const currentKeywords = keywordsText
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  return (
    <>
      {/* Account — hidden during admin impersonation so the real admin's
          name/email doesn't sit next to an impersonated client's brand. */}
      {!hideAccountCard && (
      <Card>
        <SectionHeader
          title="Account"
          editing={editingAccount}
          onEdit={() => setEditingAccount(true)}
          onCancel={cancelAccount}
        />
        {editingAccount ? (
          <>
            <div className="space-y-3">
              <EditableField label="Name" value={name} onChange={setName} />
              <ReadonlyField label="Email" value={initialEmail} />
            </div>
            <button
              onClick={saveAccount}
              disabled={savingAccount || name === savedName}
              className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingAccount ? 'Saving...' : 'Save'}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <ReadonlyField label="Name" value={savedName} />
            <ReadonlyField label="Email" value={initialEmail} />
          </div>
        )}
      </Card>
      )}

      {/* Brand profile */}
      <Card>
        <SectionHeader
          title="Brand profile"
          editing={editingBrand}
          onEdit={() => setEditingBrand(true)}
          onCancel={cancelBrand}
        />
        {editingBrand ? (
          <>
            <div className="space-y-3">
              <ReadonlyField label="Company" value={companyName} />
              <EditableField label="Industry" value={industry} onChange={setIndustry} />
              <EditableField
                label="Target audience"
                value={targetAudience}
                onChange={setTargetAudience}
                multiline
              />
              <EditableField label="Brand voice" value={brandVoice} onChange={setBrandVoice} />
              <EditableField
                label="Topic keywords"
                value={keywordsText}
                onChange={setKeywordsText}
                hint="Separate with commas"
              />
            </div>
            <button
              onClick={saveBrandProfile}
              disabled={savingBrand}
              className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingBrand ? 'Saving...' : 'Save'}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <ReadonlyField label="Company" value={companyName} />
            <ReadonlyField label="Industry" value={savedBrand.industry} />
            <ReadonlyField label="Target audience" value={savedBrand.targetAudience} />
            <ReadonlyField label="Brand voice" value={savedBrand.brandVoice} />
            {currentKeywords.length > 0 && (
              <div>
                <p className="text-sm text-text-muted mb-1">Topic keywords</p>
                <div className="flex flex-wrap gap-1">
                  {currentKeywords.map((kw) => (
                    <Badge key={kw}>{kw}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
