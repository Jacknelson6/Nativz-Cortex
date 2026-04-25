'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const { mode, toggleMode } = useBrandMode();

  const isAC = mode === 'anderson';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          redirectTo: window.location.origin + '/reset-password',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to send reset email' }));
        setError(data.error || 'Failed to send reset email');
        setLoading(false);
        return;
      }
    } catch {
      setError('Failed to send reset email. Please try again.');
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className={`fixed inset-0 z-50 flex overflow-hidden ${isAC ? 'bg-[#F4F6F8]' : 'bg-[#050510]'}`}>
      {/* Left — gradient + branding */}
      <div className="relative hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col overflow-hidden">
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
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
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
        <div className={`absolute inset-y-0 right-0 w-16 z-10 ${
          isAC ? 'bg-gradient-to-r from-transparent to-[#00161F]' : 'bg-gradient-to-r from-transparent to-[#050510]'
        }`} />
      </div>

      {/* Right — form */}
      <div className="relative flex flex-1 flex-col min-h-0">
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

        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-sm">
            {/* Mobile logo */}
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
              Reset your password
            </h1>
            <p className={`text-sm text-center mb-8 ${isAC ? 'text-[#617792]' : 'text-white/40'}`}>
              Enter your email and we&apos;ll send you a reset link
            </p>

            {submitted ? (
              <div className={`rounded-lg border px-4 py-4 text-sm text-center ${
                isAC
                  ? 'border-[#36D1C2]/40 bg-[#36D1C2]/10 text-[#00161F]'
                  : 'border-[#046BD2]/40 bg-[#046BD2]/10 text-white/80'
              }`}>
                Check your email for a reset link
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
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
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            )}

            <div className="mt-6 text-center">
              <a
                href="/login"
                className={`text-xs transition-colors ${
                  isAC ? 'text-[#36D1C2] hover:text-[#2BB5A8]' : 'text-[#046BD2]/70 hover:text-[#046BD2]'
                }`}
              >
                Back to sign in
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
