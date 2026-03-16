'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

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
      {/* Left — gradient + branding */}
      <div className="relative hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-[#050510]" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#046BD2]/20 via-transparent to-[#8B5CF6]/10" />
        <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-[#046BD2]/15 blur-[100px]" />
        <div className="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-[#8B5CF6]/10 blur-[80px]" />
        <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-[#046BD2]/8 blur-[60px]" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Branding — centered */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-10">
          <Image
            src="/nativz-logo.svg"
            alt="Nativz"
            width={120}
            height={45}
            className="h-8 w-auto mb-5"
          />
          <p className="text-xl font-semibold text-white/90 leading-snug text-center">
            State of the art<br />content intelligence.
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
