'use client';

import { createContext, useContext } from 'react';
import type { AdminWorkspaceToggleKey } from '@/lib/clients/admin-workspace-modules';

export type ClientAdminShellValue = {
  slug: string;
  clientName: string;
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
