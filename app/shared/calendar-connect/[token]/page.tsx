'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, CheckCircle2, AlertCircle, Loader2, Shield } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

type PageState = 'loading' | 'ready' | 'connecting' | 'success' | 'error' | 'expired';

export default function CalendarConnectPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [contactName, setContactName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch invite details
  useEffect(() => {
    if (!token) return;

    fetch(`/api/calendar/connect/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          if (data.error?.includes('expired')) {
            setState('expired');
          } else {
            setState('error');
            setErrorMsg(data.error ?? 'Invite not found');
          }
          return;
        }
        const data = await res.json();
        setContactName(data.contact_name ?? 'Client');
        setState('ready');
      })
      .catch(() => {
        setState('error');
        setErrorMsg('Failed to load invite');
      });
  }, [token]);

  function handleConnect() {
    setState('connecting');
    // Redirect to Google OAuth flow with the invite token as state
    window.location.href = `/api/google/connect?scope=calendar&invite_token=${token}`;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/nativz-logo.svg"
            alt="Nativz"
            width={100}
            height={38}
            className="h-8 w-auto mx-auto mb-1"
          />
          <span className="text-[10px] font-bold text-text-secondary tracking-[0.3em] uppercase">
            Cortex
          </span>
        </div>

        {/* Card */}
        <div className="bg-surface rounded-xl border border-nativz-border shadow-card p-8">
          {/* Loading */}
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={28} className="animate-spin text-text-muted" />
              <p className="text-sm text-text-muted">Loading invite...</p>
            </div>
          )}

          {/* Ready to connect */}
          {state === 'ready' && (
            <div className="text-center space-y-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-surface/20 text-accent-text mx-auto">
                <Calendar size={28} />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-text-primary mb-1">
                  Connect your calendar
                </h1>
                <p className="text-sm text-text-muted">
                  Hi {contactName}, the Nativz team would like to see your availability to help schedule shoots and meetings.
                </p>
              </div>

              {/* Privacy note */}
              <div className="flex items-start gap-2.5 rounded-lg bg-background p-3 text-left">
                <Shield size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-xs text-text-muted leading-relaxed">
                  Nativz will only see when you&apos;re <strong className="text-text-secondary">free or busy</strong>.
                  Event titles, descriptions, and attendees are never shared.
                </p>
              </div>

              <Button onClick={handleConnect} className="w-full">
                <Calendar size={16} />
                Connect Google Calendar
              </Button>
            </div>
          )}

          {/* Connecting */}
          {state === 'connecting' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={28} className="animate-spin text-accent-text" />
              <p className="text-sm text-text-muted">Redirecting to Google...</p>
            </div>
          )}

          {/* Success */}
          {state === 'success' && (
            <div className="text-center space-y-4 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 mx-auto">
                <CheckCircle2 size={28} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                  You&apos;re connected!
                </h2>
                <p className="text-sm text-text-muted">
                  The Nativz team can now see your availability. You can close this page.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {state === 'error' && (
            <div className="text-center space-y-4 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-400 mx-auto">
                <AlertCircle size={28} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                  Something went wrong
                </h2>
                <p className="text-sm text-text-muted">{errorMsg}</p>
              </div>
              <Button variant="outline" onClick={() => setState('ready')}>
                Try again
              </Button>
            </div>
          )}

          {/* Expired */}
          {state === 'expired' && (
            <div className="text-center space-y-4 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400 mx-auto">
                <AlertCircle size={28} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                  Invite expired
                </h2>
                <p className="text-sm text-text-muted">
                  This calendar connect link has expired. Ask the Nativz team for a new one.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-text-muted mt-4">
          Powered by Nativz Cortex
        </p>
      </div>
    </div>
  );
}
