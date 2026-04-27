'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Radar } from 'lucide-react';
import { toast } from 'sonner';
import { OnboardingGate } from '@/components/shared/onboarding-gate';

interface Props {
  clientId: string;
  clientName: string;
  hasHandles: boolean;
}

/**
 * Spy hub gate shown when the active brand has no `client_benchmarks` row yet.
 * Two states based on whether the brand has any IG/TikTok social_profiles —
 * if it doesn't, we route the user to brand settings instead of running an
 * audit that would 422.
 */
export function SpyBaselineGate({ clientId, clientName, hasHandles }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  async function startBaseline() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/spying/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data: unknown = await res.json().catch(() => null);
      const payload = (data && typeof data === 'object' ? data : {}) as {
        error?: string;
        missing_handles?: boolean;
      };
      if (!res.ok) {
        if (payload.missing_handles) {
          toast.error('Connect Instagram or TikTok in brand settings first.');
          startTransition(() => router.push('/brand-profile'));
          return;
        }
        toast.error(payload.error ?? 'Failed to start baseline.');
        return;
      }
      toast.success('Baseline queued — first snapshot within 24 hours.');
      startTransition(() => router.refresh());
    } catch {
      toast.error('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasHandles) {
    return (
      <OnboardingGate
        icon={<Radar size={28} />}
        eyebrow="Spy"
        title={`Connect a social handle for ${clientName} first.`}
        description="Spy benchmarks Instagram and TikTok performance on a weekly cadence. Add at least one handle in brand settings, then come back to run the baseline."
        bullets={[
          'IG and TikTok are the only scored platforms right now.',
          'Handles drive every audit, leaderboard row, and snapshot delta.',
        ]}
        primary={{ label: 'Open brand settings', href: '/brand-profile' }}
        maxWidth="md"
      />
    );
  }

  return (
    <OnboardingGate
      icon={<Radar size={28} />}
      eyebrow="Spy"
      title={`Run the Spy baseline for ${clientName}.`}
      description="We’ll benchmark this brand against itself, set the cadence to weekly, and seed the leaderboard. Add competitors as audits come in."
      bullets={[
        'Scrapes the IG and TikTok handles already on file.',
        'Scores velocity, engagement, reach, bio, and captions.',
        'Re-runs weekly so you can spot lifts and dips at a glance.',
      ]}
      primary={{
        label: 'Run baseline audit',
        onClick: startBaseline,
        loading: submitting,
      }}
      footnote="First snapshot lands within 24 hours."
      maxWidth="md"
    />
  );
}
