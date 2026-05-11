// SPY-10 T19: public confirmation page for digest unsubscribe links.
// Two-button choice: stop this type vs stop all digests. Both POST to the
// matching route. Renders a friendly confirmation after the call resolves
// so recipients don't think they need to email Jack to be removed.

'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';

type Mode = 'per_type' | 'all_stop';

export default function DigestUnsubscribePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [picked, setPicked] = useState<Mode | null>(null);

  async function submit(mode: Mode) {
    setState('submitting');
    setPicked(mode);
    try {
      const res = await fetch(`/api/p/digest-unsubscribe/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-white/5 p-8 space-y-6">
        {state === 'done' ? (
          <>
            <h1 className="text-2xl font-semibold">You&apos;re unsubscribed.</h1>
            <p className="text-sm text-white/70">
              {picked === 'all_stop'
                ? 'You won’t receive any more digests from Nativz.'
                : 'You won’t receive this digest again. Other digests, if any, stay active.'}
            </p>
            <p className="text-xs text-white/40">
              Changed your mind? Reply to the last email and we’ll resubscribe you.
            </p>
          </>
        ) : state === 'error' ? (
          <>
            <h1 className="text-2xl font-semibold">Hmm, something broke.</h1>
            <p className="text-sm text-white/70">
              Reply to the email you got and we’ll remove you manually.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Unsubscribe</h1>
            <p className="text-sm text-white/70">
              Want to stop just this digest, or every email from Nativz?
            </p>
            <div className="space-y-3">
              <button
                type="button"
                disabled={state === 'submitting'}
                onClick={() => submit('per_type')}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10 transition disabled:opacity-50"
              >
                <div className="font-medium">Stop this digest only</div>
                <div className="text-xs text-white/60">Keep other Nativz emails coming.</div>
              </button>
              <button
                type="button"
                disabled={state === 'submitting'}
                onClick={() => submit('all_stop')}
                className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left hover:bg-red-500/20 transition disabled:opacity-50"
              >
                <div className="font-medium">Stop everything</div>
                <div className="text-xs text-white/60">No more digests of any kind.</div>
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
