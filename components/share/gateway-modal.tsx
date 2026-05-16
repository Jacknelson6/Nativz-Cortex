'use client';

import { useEffect, useState } from 'react';
import { Loader2, LogIn, User as UserIcon, Mail, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';

/**
 * Three-state gateway for `/c/[token]` and `/c/edit/[token]`.
 *
 * PRD 02 §"Gateway modal": modal cannot be dismissed without choosing.
 * PRD 03 §"Name capture form": single-field guest entry, localStorage
 * per-token, "actually log in instead" back-link.
 * PRD 04 §"Modal UI": email/password + magic-link tab, agency-scoped
 * 403 with clear copy, no full-page redirect on success.
 *
 * The modal owns its own sub-view state (gateway → login | guest) and
 * never closes until the caller flips `open` to false. Success paths:
 *  - login: caller is signalled via `onLoggedIn()`; page should refetch
 *    its identity / share data so the new session takes effect.
 *  - guest: caller is signalled via `onGuestNamed(name)`; the modal
 *    writes localStorage itself so the consumer just needs to store the
 *    name in component state.
 */

export type GatewaySubView = 'choose' | 'login' | 'guest';

interface Props {
  open: boolean;
  token: string;
  // PRD 02: agencyMismatch surfaces wrong-agency sessions as an inline
  // banner without leaking the bound identity. Modal still works as
  // either guest entry or correct-agency login.
  agencyMismatch: boolean;
  // PRD 04 §"Edge cases": share links without a resolvable agency
  // suppress the login button (auth has no scope to bind against).
  agencyAvailable: boolean;
  initialView?: GatewaySubView;
  defaultGuestName?: string;
  onLoggedIn: () => void;
  onGuestNamed: (displayName: string) => void;
}

const guestStorageKey = (token: string) => `share-link-guest:${token}`;

export function ShareGatewayModal({
  open,
  token,
  agencyMismatch,
  agencyAvailable,
  initialView = 'choose',
  defaultGuestName = '',
  onLoggedIn,
  onGuestNamed,
}: Props) {
  const [view, setView] = useState<GatewaySubView>(initialView);

  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        // PRD 02 §"Gateway modal": modal cannot be dismissed without
        // choosing. We swallow backdrop clicks here too.
      }}
      onCancel={(e) => e.preventDefault()}
      title=""
      maxWidth="sm"
    >
      {view === 'choose' && (
        <ChooseView
          agencyMismatch={agencyMismatch}
          agencyAvailable={agencyAvailable}
          onPickLogin={() => setView('login')}
          onPickGuest={() => setView('guest')}
        />
      )}
      {view === 'login' && (
        <LoginView
          token={token}
          agencyMismatch={agencyMismatch}
          onSuccess={onLoggedIn}
          onBack={() => setView('choose')}
          onSwitchToGuest={() => setView('guest')}
        />
      )}
      {view === 'guest' && (
        <GuestView
          token={token}
          defaultName={defaultGuestName}
          onSubmit={(name) => {
            try {
              window.localStorage.setItem(
                guestStorageKey(token),
                JSON.stringify({
                  display_name: name,
                  accepted_at: new Date().toISOString(),
                }),
              );
            } catch {
              // PRD 03 §"Edge cases": localStorage blocked falls back to
              // in-memory only, no surfacing, the parent still gets the
              // name and the session works for this tab.
            }
            onGuestNamed(name);
          }}
          onBack={() => setView('choose')}
        />
      )}
    </Dialog>
  );
}

function ChooseView({
  agencyMismatch,
  agencyAvailable,
  onPickLogin,
  onPickGuest,
}: {
  agencyMismatch: boolean;
  agencyAvailable: boolean;
  onPickLogin: () => void;
  onPickGuest: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          Welcome
        </h2>
        <p className="text-sm text-text-secondary">
          Logging in lets your team see your name and reply to you directly.
        </p>
      </div>

      {agencyMismatch && (
        <div className="flex items-start gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            You&apos;re signed in to Cortex, but that account doesn&apos;t
            have access to this link. Log in with a different account or
            continue as a guest.
          </span>
        </div>
      )}

      <div className="space-y-2">
        <button
          type="button"
          onClick={onPickLogin}
          disabled={!agencyAvailable}
          title={
            agencyAvailable
              ? undefined
              : 'Login is unavailable for this link.'
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] transition-all hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogIn size={14} /> Log in
        </button>
        <button
          type="button"
          onClick={onPickGuest}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-nativz-border bg-transparent px-4 py-2.5 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary"
        >
          <UserIcon size={14} /> Continue as guest
        </button>
      </div>
    </div>
  );
}

function LoginView({
  token,
  agencyMismatch,
  onSuccess,
  onBack,
  onSwitchToGuest,
}: {
  token: string;
  agencyMismatch: boolean;
  onSuccess: () => void;
  onBack: () => void;
  onSwitchToGuest: () => void;
}) {
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    agencyMismatch
      ? 'Your current session doesn’t have access to this link. Log in with an account in this brand’s agency.'
      : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!email.trim() || (mode === 'password' && !password)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/${token}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'password'
            ? { mode, email: email.trim(), password }
            : { mode, email: email.trim() },
        ),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const code = json && typeof json.error === 'string' ? json.error : 'failed';
        setError(messageForError(code));
        return;
      }
      if (mode === 'magic') {
        toast.success('Check your email for the login link.');
        return;
      }
      onSuccess();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          Log in
        </h2>
        <p className="text-xs text-text-muted">
          Use the account your team gave you access with.
        </p>
      </div>

      <div className="flex gap-1.5 rounded-lg bg-surface-hover p-1 text-xs">
        <button
          type="button"
          onClick={() => setMode('password')}
          className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-all ${
            mode === 'password'
              ? 'bg-surface text-text-primary shadow-[var(--shadow-card)]'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => setMode('magic')}
          className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-all ${
            mode === 'magic'
              ? 'bg-surface text-text-primary shadow-[var(--shadow-card)]'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Magic link
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Email
        </span>
        <input
          type="email"
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
      </label>

      {mode === 'password' && (
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
        </label>
      )}

      {error && (
        <div className="rounded-lg border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !email.trim() || (mode === 'password' && !password)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] transition-all hover:bg-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : mode === 'magic' ? (
          <Mail size={14} />
        ) : (
          <LogIn size={14} />
        )}
        {mode === 'magic' ? 'Send link' : 'Log in'}
      </button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onBack}
          className="text-text-muted underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSwitchToGuest}
          className="text-text-muted underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
        >
          Use guest mode instead
        </button>
      </div>
    </form>
  );
}

function GuestView({
  token: _token,
  defaultName,
  onSubmit,
  onBack,
}: {
  token: string;
  defaultName: string;
  onSubmit: (displayName: string) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  function handle(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your name.');
      return;
    }
    // PRD 03 §"Edge cases": long names truncate with a hint, not silent
    // chopping. We surface the same toast cap as the legacy flow.
    const capped = trimmed.length > 64 ? trimmed.slice(0, 64) : trimmed;
    if (capped !== trimmed) {
      setError('Name shortened to 64 characters.');
    } else {
      setError(null);
    }
    onSubmit(capped);
  }

  return (
    <form onSubmit={handle} className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          Your name
        </h2>
        <p className="text-xs text-text-muted">
          Tell us who&apos;s reviewing so your comments are attributed
          correctly.
        </p>
      </div>

      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        maxLength={80}
        className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/40"
      />

      {error && (
        <div className="text-xs text-status-warning">{error}</div>
      )}

      <button
        type="submit"
        disabled={!name.trim()}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] transition-all hover:bg-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue
      </button>

      <button
        type="button"
        onClick={onBack}
        className="block w-full text-xs text-text-muted underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
      >
        Actually, log in instead
      </button>
    </form>
  );
}

function messageForError(code: string): string {
  switch (code) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'wrong_agency':
      return "This account doesn't have access to this link.";
    case 'expired':
      return 'This share link has expired.';
    case 'archived':
      return 'This share link has been deactivated.';
    case 'not_found':
      return 'Share link not found.';
    case 'magic_link_failed':
      return "Couldn't send the magic link. Double-check the email.";
    default:
      return 'Login failed. Please try again.';
  }
}

/**
 * Read the persisted guest name for this share token. Returns the empty
 * string when missing, the entry is malformed, or storage is unavailable.
 */
export function readGuestName(token: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(guestStorageKey(token));
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { display_name?: unknown } | null;
    if (parsed && typeof parsed.display_name === 'string') {
      return parsed.display_name.trim();
    }
  } catch {
    /* fall through */
  }
  return '';
}

export function clearGuestName(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(guestStorageKey(token));
  } catch {
    /* ignore */
  }
}
