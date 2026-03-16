'use client';

import { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const LoginScene = dynamic(() => import('@/components/login/login-scene').then((m) => ({ default: m.LoginScene })), {
  ssr: false,
});

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
    <div className="fixed inset-0 z-50 flex bg-[#050510] overflow-hidden">
      {/* Left — WebGL animation + branding */}
      <div className="relative hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col">
        {/* Particle animation */}
        <Suspense fallback={null}>
          <LoginScene />
        </Suspense>

        {/* Branding overlay */}
        <div className="relative z-10 flex flex-1 flex-col justify-end p-10">
          <Image
            src="/nativz-logo.svg"
            alt="Nativz"
            width={120}
            height={45}
            className="h-8 w-auto mb-4"
          />
          <p className="text-xl font-semibold text-white/90 leading-snug">
            Content intelligence<br />for creators.
          </p>
          <p className="text-sm text-white/40 mt-2">
            AI-powered topic research, video ideas, and scripts
          </p>
        </div>

        {/* Fade edge into right panel */}
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-[#050510] z-10" />
      </div>

      {/* Right — login form */}
      <div className="relative flex flex-1 flex-col min-h-0">
        {/* Home link */}
        <div className="p-6">
          <a
            href="https://nativz.io"
            className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            <ArrowLeft size={14} />
            Home
          </a>
        </div>

        {/* Form centered */}
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-sm">
            {/* Mobile logo */}
            <div className="lg:hidden mb-8 flex justify-center">
              <Image
                src="/nativz-logo.svg"
                alt="Nativz"
                width={120}
                height={45}
                className="h-10 w-auto"
                priority
              />
            </div>

            <h1 className="text-2xl font-bold text-white text-center mb-1">
              Sign in to Cortex
            </h1>
            <p className="text-sm text-white/40 text-center mb-8">
              Enter your credentials to continue
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm text-white/60 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@nativz.io"
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-[#046BD2]/50 focus:outline-none focus:ring-1 focus:ring-[#046BD2]/50 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm text-white/60 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-[#046BD2]/50 focus:outline-none focus:ring-1 focus:ring-[#046BD2]/50 transition-colors"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-3 text-sm font-medium text-white hover:bg-white/[0.1] transition-colors disabled:opacity-40 cursor-pointer"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-[11px] text-white/20">
            Nativz Cortex
          </p>
        </div>
      </div>
    </div>
  );
}
