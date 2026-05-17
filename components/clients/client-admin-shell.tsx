'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  ClientAdminShellProvider,
  type ClientAdminShellValue,
} from '@/components/clients/client-admin-shell-context';
import { ClientIdentityHeader } from '@/components/clients/client-identity-header';

export function ClientAdminShell({
  value,
  children,
}: {
  value: ClientAdminShellValue;
  children: React.ReactNode;
}) {
  return (
    <ClientAdminShellProvider value={value}>
      <div className="min-h-[calc(100vh-3.5rem)] overflow-y-auto">
        <div className="max-w-[1440px] px-5 lg:px-8 py-6 space-y-6">
          <Link
            href="/admin/clients"
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={13} />
            All clients
          </Link>
          <ClientIdentityHeader />
          {children}
        </div>
      </div>
    </ClientAdminShellProvider>
  );
}
