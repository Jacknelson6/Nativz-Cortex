'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

export default function PortalResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const { mode } = useBrandMode();
  const isAC = mode === 'anderson';

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
    // Also handle case where session is already set
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message || 'Failed to update password');
      setLoading(false);
      return;
    }

    router.push('/portal/search/new');
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
          <p className="mt-2 text-sm text-text-muted">
            {ready ? 'Set a new password' : 'Validating your reset link…'}
          </p>
        </div>

        <Card className="shadow-sm">
          {ready && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="password"
                label="New password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                id="confirm-password"
                label="Confirm password"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Updating...' : 'Update password'}
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
