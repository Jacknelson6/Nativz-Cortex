'use client';

import { ClientLogo } from '@/components/clients/client-logo';
import { ImpersonateButton } from '@/components/clients/impersonate-button';
import { InviteButton } from '@/components/clients/invite-button';
import { DeleteClientButton } from '@/components/clients/delete-client-button';
import { useClientAdminShell } from '@/components/clients/client-admin-shell-context';

/**
 * Persistent client identity strip at the top of every settings page.
 *
 * Surfaces logo, name, slug plus one-click Invite + Impersonate access. The
 * onboarding entry point lives on /admin/onboarding (the dedicated tracker)
 * rather than fighting for space in this header strip.
 */
export function ClientIdentityHeader() {
  const shell = useClientAdminShell();
  if (!shell) return null;
  const { slug, clientName, clientId, organizationId, logoUrl } = shell;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-nativz-border bg-surface/60 px-4 py-3">
      <ClientLogo src={logoUrl} name={clientName} size="lg" />
      <div className="min-w-0 flex-1">
        <h2 className="ui-card-title truncate" title={clientName}>
          {clientName}
        </h2>
        <p className="mt-0.5 font-mono text-[11px] text-text-muted/70 truncate">{slug}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <InviteButton
          clientId={clientId}
          clientName={clientName}
          variant="compact"
        />
        {organizationId && (
          <ImpersonateButton
            organizationId={organizationId}
            clientSlug={slug}
          />
        )}
        <DeleteClientButton clientId={clientId} clientName={clientName} />
      </div>
    </div>
  );
}
