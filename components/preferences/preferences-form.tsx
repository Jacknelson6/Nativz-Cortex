'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Save, Palette, TrendingUp, ShieldOff, Trophy, CalendarDays } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TagInput } from '@/components/ui/tag-input';
import type { ClientPreferences } from '@/lib/types/database';

interface PreferencesFormProps {
  clientId: string;
  clientName: string;
  initialPreferences: ClientPreferences;
  readOnly?: boolean;
}

const EMPTY_PREFERENCES: ClientPreferences = {
  tone_keywords: [],
  topics_lean_into: [],
  topics_avoid: [],
  competitor_accounts: [],
  seasonal_priorities: [],
};

export function PreferencesForm({
  clientId,
  clientName,
  initialPreferences,
  readOnly = false,
}: PreferencesFormProps) {
  const prefs = { ...EMPTY_PREFERENCES, ...initialPreferences };

  const [toneKeywords, setToneKeywords] = useState(prefs.tone_keywords);
  const [topicsLeanInto, setTopicsLeanInto] = useState(prefs.topics_lean_into);
  const [topicsAvoid, setTopicsAvoid] = useState(prefs.topics_avoid);
  const [competitorAccounts, setCompetitorAccounts] = useState(prefs.competitor_accounts);
  const [seasonalPriorities, setSeasonalPriorities] = useState(prefs.seasonal_priorities);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/clients/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          preferences: {
            tone_keywords: toneKeywords,
            topics_lean_into: topicsLeanInto,
            topics_avoid: topicsAvoid,
            competitor_accounts: competitorAccounts,
            seasonal_priorities: seasonalPriorities,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to save preferences.');
      } else {
        toast.success('Preferences saved.');
      }
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <div className="flex items-center gap-2.5 mb-1">
          <Palette size={16} className="text-accent-text" />
          <h2 className="text-base font-semibold text-text-primary">Tone keywords</h2>
        </div>
        <p className="text-sm text-text-muted mb-4">Words that describe {clientName}&apos;s brand voice and personality.</p>
        <TagInput
          id="tone_keywords"
          value={toneKeywords}
          onChange={setToneKeywords}
          placeholder="e.g., bold, playful, authoritative"
          maxTags={20}
        />
      </Card>

      <Card>
        <div className="flex items-center gap-2.5 mb-1">
          <TrendingUp size={16} className="text-green-400" />
          <h2 className="text-base font-semibold text-text-primary">Topics to lean into</h2>
        </div>
        <p className="text-sm text-text-muted mb-4">Topics and themes you want to create more content about.</p>
        <TagInput
          id="topics_lean_into"
          value={topicsLeanInto}
          onChange={setTopicsLeanInto}
          placeholder="e.g., sustainable fashion, behind the scenes"
          maxTags={30}
        />
      </Card>

      <Card>
        <div className="flex items-center gap-2.5 mb-1">
          <ShieldOff size={16} className="text-red-400" />
          <h2 className="text-base font-semibold text-text-primary">Topics to avoid</h2>
        </div>
        <p className="text-sm text-text-muted mb-4">Subjects and themes to steer away from in content.</p>
        <TagInput
          id="topics_avoid"
          value={topicsAvoid}
          onChange={setTopicsAvoid}
          placeholder="e.g., politics, competitor drama"
          maxTags={30}
        />
      </Card>

      <Card>
        <div className="flex items-center gap-2.5 mb-1">
          <Trophy size={16} className="text-yellow-400" />
          <h2 className="text-base font-semibold text-text-primary">Competitors you admire</h2>
        </div>
        <p className="text-sm text-text-muted mb-4">Brands or accounts whose content style you look up to.</p>
        <TagInput
          id="competitor_accounts"
          value={competitorAccounts}
          onChange={setCompetitorAccounts}
          placeholder="e.g., @nike, @glossier, Apple"
          maxTags={20}
        />
      </Card>

      <Card>
        <div className="flex items-center gap-2.5 mb-1">
          <CalendarDays size={16} className="text-purple-400" />
          <h2 className="text-base font-semibold text-text-primary">Seasonal priorities</h2>
        </div>
        <p className="text-sm text-text-muted mb-4">Current campaigns, seasonal themes, or upcoming focuses.</p>
        <TagInput
          id="seasonal_priorities"
          value={seasonalPriorities}
          onChange={setSeasonalPriorities}
          placeholder="e.g., Summer 2026 launch, Back to school"
          maxTags={20}
        />
      </Card>

      {!readOnly && (
        <Button type="submit" disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving...' : 'Save preferences'}
        </Button>
      )}
    </form>
  );
}
