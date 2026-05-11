'use client';

// SPY-03 T20: wrapper that composes the 5 sub-cards + observations +
// opportunity into the full Analysis tab. Owns the re-run CTA, the
// override-write side-effect (PATCHes /api/prospects/[id]/analysis), and
// the empty/pending/failed states.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { ProfilePicCard } from './profile-pic-card';
import { BioCard } from './bio-card';
import { CaptionPatternCard } from './caption-pattern-card';
import { CommentSignalCard } from './comment-signal-card';
import { PostingCadenceCard } from './posting-cadence-card';
import { ObservationsList } from './observations-list';
import { BiggestOpportunityCard } from './biggest-opportunity-card';
import type {
  BioAssessment,
  ProfilePicAssessment,
  ProspectAnalysisRow,
} from '@/lib/prospects/types';

interface Props {
  prospectId: string;
  latestAnalysis: ProspectAnalysisRow | null;
  canRerun: boolean;
  retryAfterSec?: number;
}

export function ProspectAnalysisCard({ prospectId, latestAnalysis, canRerun, retryAfterSec }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, unknown>>(
    latestAnalysis?.overrides ?? {},
  );

  const overrides = useMemo(() => ({ ...(latestAnalysis?.overrides ?? {}), ...localOverrides }), [
    latestAnalysis?.overrides,
    localOverrides,
  ]);

  async function rerun(force = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function patchOverride(patch: Record<string, unknown>) {
    if (!latestAnalysis) return;
    setLocalOverrides((prev) => ({ ...prev, ...patch }));
    try {
      const res = await fetch(`/api/prospects/${prospectId}/analysis`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: latestAnalysis.run_id, overrides: patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Override failed (HTTP ${res.status})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Override failed');
    }
  }

  // ── Empty state (no row yet) ────────────────────────────────────────
  if (!latestAnalysis) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <Loader2 className="mx-auto mb-2 size-5 animate-spin text-text-muted" />
        <h3 className="text-sm font-medium text-foreground">Analysis pending</h3>
        <p className="mt-1 text-sm text-text-muted">
          We&apos;re scanning the profile. This usually takes about a minute.
        </p>
        <button
          type="button"
          onClick={() => rerun(true)}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Run analysis now
        </button>
      </div>
    );
  }

  // ── Failed state ────────────────────────────────────────────────────
  if (latestAnalysis.status === 'failed') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-500" />
          <h3 className="text-sm font-medium text-foreground">Analysis failed</h3>
        </div>
        <p className="text-sm text-text-muted">
          {latestAnalysis.error_message ?? 'Unknown error during analysis.'}
        </p>
        <button
          type="button"
          onClick={() => rerun(true)}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Retry analysis
        </button>
      </div>
    );
  }

  const lastRun = new Date(latestAnalysis.created_at).toLocaleString();
  const profilePicOverride = (overrides.profile_pic_assessment as Partial<ProfilePicAssessment>) ?? undefined;
  const bioOverride = (overrides.bio_assessment as Partial<BioAssessment>) ?? undefined;
  const observationsOverride = overrides.observations as string[] | undefined;
  const opportunityOverride = overrides.biggest_opportunity as string | undefined;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Initial analysis</h2>
          <p className="text-sm text-text-muted">
            @{latestAnalysis.handle} on {latestAnalysis.platform} · Last run {lastRun}
            {latestAnalysis.status === 'partial' && ' · partial result'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => rerun(false)}
          disabled={busy || !canRerun}
          title={
            !canRerun && retryAfterSec
              ? `Available in ${Math.ceil(retryAfterSec / 60)} min`
              : undefined
          }
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Re-run analysis
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ProfilePicCard
          assessment={latestAnalysis.profile_pic_assessment}
          overrides={profilePicOverride}
          onOverride={(patch) =>
            patchOverride({ profile_pic_assessment: { ...(profilePicOverride ?? {}), ...patch } })
          }
        />
        <BioCard
          assessment={latestAnalysis.bio_assessment}
          overrides={bioOverride}
          onOverride={(patch) =>
            patchOverride({ bio_assessment: { ...(bioOverride ?? {}), ...patch } })
          }
        />
        <CaptionPatternCard pattern={latestAnalysis.caption_pattern} />
        <CommentSignalCard signal={latestAnalysis.comment_signal} />
        <PostingCadenceCard cadence={latestAnalysis.posting_cadence} />
      </div>

      <ObservationsList
        observations={latestAnalysis.observations ?? []}
        overrides={{ observations: observationsOverride }}
        onEdit={(idx, value) => {
          const next = [...(observationsOverride ?? latestAnalysis.observations ?? [])];
          next[idx] = value;
          patchOverride({ observations: next });
        }}
      />

      <BiggestOpportunityCard
        opportunity={latestAnalysis.biggest_opportunity}
        override={opportunityOverride}
        onOverride={(value) => patchOverride({ biggest_opportunity: value })}
      />
    </div>
  );
}
