'use client';

// ZNA-03: thin client wrapper that owns pulse state + wires admin actions
// against the /api/analytics/zernio/pulse/* routes. Portal mode renders
// the same card with no action handlers.

import { useState } from 'react';
import { ZernioPulseCard, type PulseShape } from './zernio-pulse-card';

interface Props {
  initial: PulseShape | null;
  clientId: string;
  isPortal?: boolean;
}

export function ZernioPulseMount({ initial, clientId, isPortal }: Props) {
  const [pulse, setPulse] = useState<PulseShape | null>(initial);

  async function refresh() {
    const base = isPortal
      ? '/api/portal/analytics/zernio/pulse'
      : `/api/analytics/zernio/pulse?client_id=${clientId}`;
    const res = await fetch(base);
    if (!res.ok) return;
    const body = (await res.json()) as { pulse: PulseShape | null };
    setPulse(body.pulse);
  }

  if (isPortal) {
    return <ZernioPulseCard pulse={pulse} isPortal />;
  }

  async function onDismiss() {
    if (!pulse) return;
    const res = await fetch(`/api/analytics/zernio/pulse/${pulse.id}/dismiss`, { method: 'POST' });
    if (!res.ok) throw new Error('Dismiss failed');
    setPulse(null);
  }

  async function onRegenerate() {
    const res = await fetch(`/api/analytics/zernio/pulse/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    });
    if (res.status === 422) {
      const body = (await res.json()) as { error: string };
      if (body.error === 'no_signal') throw new Error('No signal crossed the threshold today.');
      if (body.error === 'banned_topic') throw new Error('Model output failed validation twice. Try again later.');
      throw new Error('Regenerate failed');
    }
    if (!res.ok) throw new Error('Regenerate failed');
    const body = (await res.json()) as { pulse: PulseShape | null };
    setPulse(body.pulse);
  }

  async function onToggleLock(locked: boolean) {
    if (!pulse) return;
    const res = await fetch(`/api/analytics/zernio/pulse/${pulse.id}/lock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locked }),
    });
    if (!res.ok) throw new Error('Lock toggle failed');
    await refresh();
  }

  async function onFlagWrong(reason?: string) {
    if (!pulse) return;
    const res = await fetch(`/api/analytics/zernio/pulse/${pulse.id}/flag-wrong`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: reason ?? '' }),
    });
    if (!res.ok) throw new Error('Flag failed');
    await refresh();
  }

  return (
    <ZernioPulseCard
      pulse={pulse}
      onDismiss={onDismiss}
      onRegenerate={onRegenerate}
      onToggleLock={onToggleLock}
      onFlagWrong={onFlagWrong}
    />
  );
}
