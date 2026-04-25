import { Wrench } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Cortex — under maintenance',
};

export default function MaintenancePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/30">
          <Wrench size={20} className="text-amber-400" />
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Cortex is rolling out an update
          </h1>
          <p className="text-sm leading-relaxed text-text-secondary">
            We&rsquo;re consolidating the client surface into a faster, unified
            workspace. Access will be restored within a few hours. If you need
            anything urgent, ping the Nativz team by email and we&rsquo;ll
            handle it manually until you&rsquo;re back in.
          </p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
