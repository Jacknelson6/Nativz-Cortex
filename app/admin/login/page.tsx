'use client';

import { useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
      console.error('Login error:', authError);
      setError(authError.message || 'Login failed — check browser console');
      setLoading(false);
      return;
    }

    router.push('/admin/dashboard');
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden">
      {/* Left — login form */}
      <div className="flex flex-1 items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex items-center justify-center">
              <Image
                src="/nativz-logo.svg"
                alt="Nativz"
                width={140}
                height={53}
                className="h-12 w-auto"
                priority
              />
            </div>
            <p className="mt-2 text-sm text-text-muted">Admin sign in</p>
          </div>

          <div className="rounded-xl bg-surface p-6 shadow-sm border border-nativz-border">
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                id="email"
                label="Email"
                type="email"
                placeholder="you@nativz.io"
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
          </div>

          <p className="mt-6 text-center text-[11px] text-text-muted/50">
            Nativz Cortex
          </p>
        </div>
      </div>

      {/* Right — Dallas skyline with blue overlay */}
      <div className="relative hidden lg:block lg:flex-1">
        <Image
          src="/dallas-skyline.jpg"
          alt="Dallas skyline at night"
          fill
          className="object-cover"
          priority
        />
        {/* Blue gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#046BD2]/70 via-[#046BD2]/50 to-[#0a0a14]/80" />
        {/* Bottom text */}
        <div className="absolute bottom-8 left-8 right-8">
          <p className="text-2xl font-bold text-white/90">
            Content intelligence for creators
          </p>
          <p className="text-sm text-white/50 mt-2">
            AI-powered topic research, video ideas, and content strategy
          </p>
        </div>
      </div>
    </div>
  );
}
