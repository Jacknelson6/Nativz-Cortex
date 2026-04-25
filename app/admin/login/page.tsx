'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useBrandMode } from '@/components/layout/brand-mode-provider';
import { PORTAL_HOME_PATH } from '@/lib/portal/client-surface';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, toggleMode } = useBrandMode();

  const isAC = mode === 'anderson';
  const isDeactivated = searchParams.get('error') === 'deactivated';

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.error('Login error:', authError);
      setError(authError.message || 'Login failed — check browser console');
      setLoading(false);
      return;
    }

    // Look up user role to redirect appropriately
    const userId = data.user?.id;
    if (userId) {
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (userData?.role === 'viewer') {
        router.push(PORTAL_HOME_PATH);
        router.refresh();
        return;
      }
    }

    router.push('/admin/dashboard');
    router.refresh();
  }

  return (
    <div className={`fixed inset-0 z-50 flex overflow-hidden ${isAC ? 'bg-[#F4F6F8]' : 'bg-[#050510]'}`}>
      {/* Left — gradient + branding */}
      <div className="relative hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col overflow-hidden">
        {/* Gradient background */}
        <div className={`absolute inset-0 ${isAC ? 'bg-[#00161F]' : 'bg-[#050510]'}`} />
        <div className={`absolute inset-0 ${
          isAC
            ? 'bg-gradient-to-br from-[#36D1C2]/25 via-transparent to-[#2BB5A8]/15'
            : 'bg-gradient-to-br from-[#046BD2]/20 via-transparent to-[#EC4899]/10'
        }`} />
        <div className={`absolute -top-40 -left-40 h-80 w-80 rounded-full blur-[100px] ${
          isAC ? 'bg-[#36D1C2]/20' : 'bg-[#046BD2]/15'
        }`} />
        <div className={`absolute -bottom-20 -right-20 h-60 w-60 rounded-full blur-[80px] ${
          isAC ? 'bg-[#2BB5A8]/15' : 'bg-[#EC4899]/10'
        }`} />
        <div className={`absolute top-1/3 right-1/4 h-40 w-40 rounded-full blur-[60px] ${
          isAC ? 'bg-[#36D1C2]/10' : 'bg-[#046BD2]/8'
        }`} />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Branding — centered, click to toggle */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-10">
          <button
            type="button"
            onClick={(e) => toggleMode(e)}
            className="cursor-pointer hover:opacity-80 transition-opacity mb-5"
            aria-label={`Switch to ${isAC ? 'Nativz' : 'Anderson Collaborative'} mode`}
          >
            {isAC ? (
              <img src="/anderson-logo.svg" alt="Anderson Collaborative" className="h-10 w-auto" />
            ) : (
              <Image src="/nativz-logo.svg" alt="Nativz" width={120} height={45} className="h-8 w-auto" />
            )}
          </button>
          <p className="text-xl font-semibold text-white/90 leading-snug text-center">
State of the art<br />content intelligence.
          </p>
        </div>

        {/* Fade edge into right panel */}
        <div className={`absolute inset-y-0 right-0 w-16 z-10 ${
          isAC ? 'bg-gradient-to-r from-transparent to-[#00161F]' : 'bg-gradient-to-r from-transparent to-[#050510]'
        }`} />
      </div>

      {/* Right — login form */}
      <div className="relative flex flex-1 flex-col min-h-0">
        {/* Home link */}
        <div className="cortex-page-gutter">
          <a
            href={isAC ? 'https://andersoncollaborative.com' : 'https://nativz.io'}
            className={`inline-flex items-center gap-1.5 text-sm transition-colors ${
              isAC ? 'text-[#617792] hover:text-[#00161F]' : 'text-white/40 hover:text-white/70'
            }`}
          >
            <ArrowLeft size={14} />
            Home
          </a>
        </div>

        {/* Form centered */}
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-sm">
            {/* Mobile logo — click to toggle */}
            <div className="lg:hidden mb-8 flex justify-center">
              <button
                type="button"
                onClick={(e) => toggleMode(e)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                aria-label={`Switch to ${isAC ? 'Nativz' : 'Anderson Collaborative'} mode`}
              >
                {isAC ? (
                  <img src="/anderson-logo-dark.svg" alt="Anderson Collaborative" className="h-10 w-auto" />
                ) : (
                  <Image src="/nativz-logo.svg" alt="Nativz" width={120} height={45} className="h-10 w-auto" priority />
                )}
              </button>
            </div>

            <h1 className={`text-2xl font-bold text-center mb-1 ${isAC ? 'text-[#00161F]' : 'text-white'}`}>
              Sign in to Cortex
            </h1>
            <p className={`text-sm text-center mb-8 ${isAC ? 'text-[#617792]' : 'text-white/40'}`}>
              Enter your credentials to continue
            </p>

            {isDeactivated && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                Your account has been deactivated. Contact your administrator.
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className={`block text-sm mb-1.5 ${isAC ? 'text-[#161519]' : 'text-white/60'}`}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isAC ? 'you@andersoncollaborative.com' : 'you@company.com'}
                  autoComplete="email"
                  required
                  className={`w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-1 transition-colors ${
                    isAC
                      ? 'border-[#B3BEC9] bg-white text-[#00161F] placeholder:text-[#B3BEC9] focus:border-[#36D1C2]/50 focus:ring-[#36D1C2]/50'
                      : 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-white/25 focus:border-[#046BD2]/50 focus:ring-[#046BD2]/50'
                  }`}
                />
              </div>

              <div>
                <label htmlFor="password" className={`block text-sm mb-1.5 ${isAC ? 'text-[#161519]' : 'text-white/60'}`}>
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    className={`w-full rounded-lg border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-1 transition-colors ${
                      isAC
                        ? 'border-[#B3BEC9] bg-white text-[#00161F] placeholder:text-[#B3BEC9] focus:border-[#36D1C2]/50 focus:ring-[#36D1C2]/50'
                        : 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-white/25 focus:border-[#046BD2]/50 focus:ring-[#046BD2]/50'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors cursor-pointer ${
                      isAC ? 'text-[#617792]/50 hover:text-[#617792]' : 'text-white/30 hover:text-white/60'
                    }`}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-lg border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-40 cursor-pointer ${
                  isAC
                    ? 'border-[#36D1C2] bg-[#36D1C2] text-white hover:bg-[#2BB5A8]'
                    : 'border-white/[0.12] bg-white/[0.06] text-white hover:bg-white/[0.1]'
                }`}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="text-center mt-4">
              <a
                href="/forgot-password"
                className={`text-xs transition-colors ${
                  isAC ? 'text-[#617792] hover:text-[#00161F]' : 'text-white/40 hover:text-white/70'
                }`}
              >
                Forgot password?
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
