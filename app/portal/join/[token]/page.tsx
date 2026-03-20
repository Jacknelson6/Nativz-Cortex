'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

type InviteStatus = 'loading' | 'valid' | 'invalid' | 'expired' | 'used';
type FlowMode = 'signup' | 'link-existing';

export default function PortalJoinPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { mode } = useBrandMode();
  const isAC = mode === 'anderson';

  const [status, setStatus] = useState<InviteStatus>('loading');
  const [clientName, setClientName] = useState('');
  const [flowMode, setFlowMode] = useState<FlowMode>('signup');

  // Signup fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Link existing account fields
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkSuccess, setLinkSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      try {
        const res = await fetch(`/api/invites/validate?token=${params.token}`);
        if (!res.ok) {
          const data = await res.json();
          if (data.reason === 'used') setStatus('used');
          else if (data.reason === 'expired') setStatus('expired');
          else setStatus('invalid');
          return;
        }
        const data = await res.json();
        setClientName(data.client_name);
        setStatus('valid');
      } catch {
        setStatus('invalid');
      }
    }
    validateToken();
  }, [params.token]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: params.token,
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // Account already exists — suggest linking
          setError('');
          setLinkEmail(email.trim());
          setFlowMode('link-existing');
          setSubmitting(false);
          return;
        }
        setError(data.error || 'Something went wrong. Try again.');
        setSubmitting(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('Something went wrong. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  async function handleLinkAccount(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      // First sign in to get an authenticated session
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: linkEmail.trim(),
        password: linkPassword,
      });

      if (signInError) {
        setError('Invalid email or password. Please try again.');
        setSubmitting(false);
        return;
      }

      // Now link the account to the invite's organization
      const res = await fetch('/api/invites/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to link account.');
        setSubmitting(false);
        return;
      }

      setLinkSuccess(true);
    } catch {
      setError('Something went wrong. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            {isAC ? (
              <img src="/anderson-logo.svg" alt="Anderson Collaborative" className="h-12 w-auto" />
            ) : (
              <Image
                src="/nativz-logo.svg"
                alt="Nativz"
                width={140}
                height={53}
                className="h-12 w-auto"
                priority
              />
            )}
          </div>
        </div>

        {/* Loading state */}
        {status === 'loading' && (
          <div className="rounded-xl bg-surface p-6 border border-nativz-border text-center">
            <p className="text-sm text-text-muted">Validating invite...</p>
          </div>
        )}

        {/* Invalid/expired/used states */}
        {(status === 'invalid' || status === 'expired' || status === 'used') && (
          <div className="rounded-xl bg-surface p-6 border border-nativz-border text-center space-y-3">
            <AlertCircle size={32} className="mx-auto text-red-400" />
            <h2 className="text-lg font-semibold text-text-primary">
              {status === 'used' ? 'Invite already used' : status === 'expired' ? 'Invite expired' : 'Invalid invite'}
            </h2>
            <p className="text-sm text-text-muted">
              {status === 'used'
                ? 'This invite link has already been used to create an account.'
                : status === 'expired'
                  ? 'This invite link has expired. Ask your account manager for a new one.'
                  : 'This invite link is not valid. Check the link or ask your account manager.'}
            </p>
            <Link href="/portal/login">
              <Button variant="outline" className="mt-2">
                Go to login
              </Button>
            </Link>
          </div>
        )}

        {/* Signup success */}
        {success && (
          <div className="rounded-xl bg-surface p-6 border border-nativz-border text-center space-y-3">
            <CheckCircle2 size={32} className="mx-auto text-emerald-400" />
            <h2 className="text-lg font-semibold text-text-primary">Account created</h2>
            <p className="text-sm text-text-muted">
              Your portal account is ready. Sign in to access your dashboard.
            </p>
            <Button className="mt-2 w-full" onClick={() => router.push('/portal/login')}>
              Sign in
            </Button>
          </div>
        )}

        {/* Link success */}
        {linkSuccess && (
          <div className="rounded-xl bg-surface p-6 border border-nativz-border text-center space-y-3">
            <CheckCircle2 size={32} className="mx-auto text-emerald-400" />
            <h2 className="text-lg font-semibold text-text-primary">Account linked</h2>
            <p className="text-sm text-text-muted">
              Your account has been linked to the <span className="font-medium text-text-primary">{clientName}</span> portal.
            </p>
            <Button className="mt-2 w-full" onClick={() => router.push('/portal/dashboard')}>
              Go to dashboard
            </Button>
          </div>
        )}

        {/* Signup form */}
        {status === 'valid' && !success && !linkSuccess && flowMode === 'signup' && (
          <>
            <div className="text-center mb-6">
              <p className="text-sm text-text-muted">
                You&apos;ve been invited to join the <span className="font-medium text-text-primary">{clientName}</span> portal
              </p>
            </div>

            <div className="rounded-xl bg-surface p-6 border border-nativz-border">
              <h2 className="text-base font-semibold text-text-primary mb-4">Create your account</h2>

              <form onSubmit={handleSignup} className="space-y-4">
                <Input
                  id="full_name"
                  label="Full name"
                  type="text"
                  placeholder="Jane Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
                <Input
                  id="email"
                  label="Email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  id="password"
                  label="Password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />

                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Creating account...' : 'Create account'}
                </Button>
              </form>
            </div>

            <p className="mt-4 text-center text-xs text-text-muted">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setFlowMode('link-existing')}
                className="text-accent-text hover:underline"
              >
                Sign in to link it
              </button>
            </p>
          </>
        )}

        {/* Link existing account form */}
        {status === 'valid' && !success && !linkSuccess && flowMode === 'link-existing' && (
          <>
            <div className="text-center mb-6">
              <p className="text-sm text-text-muted">
                Link your existing account to the <span className="font-medium text-text-primary">{clientName}</span> portal
              </p>
            </div>

            <div className="rounded-xl bg-surface p-6 border border-nativz-border">
              <div className="flex items-center gap-2 mb-4">
                <LogIn size={16} className="text-accent-text" />
                <h2 className="text-base font-semibold text-text-primary">Sign in to link</h2>
              </div>

              <form onSubmit={handleLinkAccount} className="space-y-4">
                <Input
                  id="link_email"
                  label="Email"
                  type="email"
                  placeholder="you@company.com"
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                  required
                />
                <Input
                  id="link_password"
                  label="Password"
                  type="password"
                  placeholder="Your existing password"
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  required
                />

                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Linking account...' : 'Sign in & link'}
                </Button>
              </form>
            </div>

            <p className="mt-4 text-center text-xs text-text-muted">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => { setFlowMode('signup'); setError(''); }}
                className="text-accent-text hover:underline"
              >
                Create one instead
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
