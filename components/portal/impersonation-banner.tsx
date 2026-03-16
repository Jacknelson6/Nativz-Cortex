'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function ImpersonationBanner() {
  const [impersonating, setImpersonating] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientSlug, setClientSlug] = useState('');

  useEffect(() => {
    async function checkImpersonation() {
      try {
        const res = await fetch('/api/impersonate/status');
        if (res.ok) {
          const data = await res.json();
          if (data.impersonating) {
            setImpersonating(true);
            setClientName(data.client_name ?? 'Unknown client');
            setClientSlug(data.client_slug ?? '');
          }
        }
      } catch {
        // Not impersonating
      }
    }
    checkImpersonation();
  }, []);

  if (!impersonating) return null;

  async function handleExit() {
    try {
      await fetch('/api/impersonate', { method: 'DELETE' });
      window.location.href = clientSlug
        ? `/admin/clients/${clientSlug}`
        : '/admin/clients';
    } catch {
      window.location.href = '/admin/clients';
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-sm text-amber-300">
      <AlertTriangle size={14} className="shrink-0" />
      <span>Viewing as <strong>{clientName}</strong></span>
      <button
        onClick={handleExit}
        className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/30 transition-colors"
      >
        <X size={12} />
        Exit impersonation
      </button>
    </div>
  );
}
