'use client';

import { createContext, useContext } from 'react';
import type { AdminWorkspaceToggleKey } from '@/lib/clients/admin-workspace-modules';

export type ClientAdminShellValue = {
  slug: string;
  clientName: string;
  /** Client UUID — needed by sidebar action buttons (Invite, etc.). */
  clientId: string;
  /** Organization UUID — needed by Impersonate in the sidebar. */
  organizationId: string | null;
  /** Real client logo (fallback renders initials). */
  logoUrl?: string | null;
  /** Sales-pipeline stage from `clients.lifecycle_state`. Only 'lead' brands
   *  are still prospects — they're the ones that get the "Start onboarding"
   *  CTA. Anything else (contracted/paid_deposit/active/churned) has either
   *  already been onboarded or moved past the lead stage. */
  lifecycleState: string | null;
  /** Normalized visibility for admin workspace nav (sidebar + mobile). */
  adminWorkspaceModules: Record<AdminWorkspaceToggleKey, boolean>;
};

const ClientAdminShellContext = createContext<ClientAdminShellValue | null>(null);

export function ClientAdminShellProvider({
  value,
  children,
}: {
  value: ClientAdminShellValue;
  children: React.ReactNode;
}) {
  return (
    <ClientAdminShellContext.Provider value={value}>
      {children}
    </ClientAdminShellContext.Provider>
  );
}

/**
 * Non-null when rendered inside `/admin/clients/[slug]` layout (sidebar shell).
 */
export function useClientAdminShell(): ClientAdminShellValue | null {
  return useContext(ClientAdminShellContext);
}
