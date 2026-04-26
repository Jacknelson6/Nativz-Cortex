'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

export default function AdminResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const { mode, toggleMode } = useBrandMode();

  const isAC = mode === 'anderson';

  useEffect(() => {
    const supabase = createClient();

    // Supabase admin-generated recovery link lands on this page as
    // `?token_hash=<h>&type=recovery`. Exchange the token ourselves — the
    // browser client's PKCE auto-exchange can't run because there's no
    // paired code_verifier cookie on this device.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');

    async function init() {
      if (tokenHash && type === 'recovery') {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (verifyError) {
          setError('Reset link is invalid or expired. Request a new one.');
          return;
        }
        // Strip token params from URL so refreshes don't re-run verifyOtp.
        window.history.replaceState({}, '', window.location.pathname);
        setReady(true);
        return;
      }

      // Fallback for existing sessions (page reload after a successful verify).
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setReady(true);
    }

    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
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
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message || 'Failed to update password');
        return;
      }

      router.push('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
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
              Set new password
            </h1>
            <p className={`text-sm text-center mb-8 ${
              !ready && error
                ? 'text-red-400'
                : isAC ? 'text-[#617792]' : 'text-white/40'
            }`}>
              {ready
                ? 'Choose a new password for your account'
                : error || 'Validating your reset link…'}
            </p>

            {ready && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className={`block text-sm mb-1.5 ${isAC ? 'text-[#161519]' : 'text-white/60'}`}>
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
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

                <div>
                  <label htmlFor="confirm-password" className={`block text-sm mb-1.5 ${isAC ? 'text-[#161519]' : 'text-white/60'}`}>
                    Confirm password
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
                      autoComplete="new-password"
                      required
                      className={`w-full rounded-lg border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-1 transition-colors ${
                        isAC
                          ? 'border-[#B3BEC9] bg-white text-[#00161F] placeholder:text-[#B3BEC9] focus:border-[#36D1C2]/50 focus:ring-[#36D1C2]/50'
                          : 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-white/25 focus:border-[#046BD2]/50 focus:ring-[#046BD2]/50'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors cursor-pointer ${
                        isAC ? 'text-[#617792]/50 hover:text-[#617792]' : 'text-white/30 hover:text-white/60'
                      }`}
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-500">{error}</p>
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
                  {loading ? 'Updating...' : 'Update password'}
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
