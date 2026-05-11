// SPY-02 T12: server-component shell for /admin/prospects/new. The
// admin layout already enforces role gating, so this just renders the
// client form. Keep this thin — the heavy lifting is in QuickOnboardForm.

import { QuickOnboardForm } from '@/components/prospects/quick-onboard-form';

export const dynamic = 'force-dynamic';

export default function NewProspectPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">New prospect</h1>
        <p className="text-sm text-text-muted">
          Paste a website or social profile URL. We'll fill in the brand name, favicon, and detected
          socials so the record is ready before the call ends.
        </p>
      </header>
      <QuickOnboardForm />
    </div>
  );
}
