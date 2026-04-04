'use client';

import { useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

export default function PortalForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const { mode } = useBrandMode();
  const isAC = mode === 'anderson';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/portal/reset-password',
    });

    if (authError) {
      setError(authError.message || 'Failed to send reset email');
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm">
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
          <p className="mt-2 text-sm text-text-muted">Reset your password</p>
        </div>

        <Card className="shadow-sm">
          {submitted ? (
            <p className="text-sm text-center py-2 text-text-muted">
              Check your email for a reset link
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="email"
                label="Email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send reset link'}
              </Button>
            </form>
          )}
        </Card>

        <div className="mt-4 text-center">
          <a href="/portal/login" className="text-xs text-text-muted hover:text-text-default transition-colors">
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
