'use client';

import { useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useBrandMode } from '@/components/layout/brand-mode-provider';
import { PORTAL_HOME_PATH } from '@/lib/portal/client-surface';

export default function PortalLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode } = useBrandMode();
  const isAC = mode === 'anderson';
  const isDeactivated = searchParams.get('error') === 'deactivated';

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push(PORTAL_HOME_PATH);
    router.refresh();
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
          <p className="mt-2 text-sm text-text-muted">Client portal sign in</p>
        </div>

        {isDeactivated && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            Your account has been deactivated. Contact your administrator.
          </div>
        )}

        <Card className="shadow-sm">
          <form onSubmit={handleLogin} className="space-y-4">
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
              placeholder=""
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <div className="mt-4 text-center">
          <a href="/portal/forgot-password" className="text-xs text-text-muted hover:text-text-default transition-colors">
            Forgot password?
          </a>
        </div>
      </div>
    </div>
  );
}
