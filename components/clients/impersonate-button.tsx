'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ImpersonateButtonProps {
  organizationId: string;
  clientSlug: string;
}

export function ImpersonateButton({ organizationId, clientSlug }: ImpersonateButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleImpersonate() {
    setLoading(true);
    try {
      const res = await fetch('/api/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, client_slug: clientSlug }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to start impersonation');
        return;
      }

      const data = await res.json();
      window.location.href = data.redirect;
    } catch {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleImpersonate} disabled={loading}>
      <Eye size={14} />
      {loading ? 'Loading...' : 'Impersonate'}
    </Button>
  );
}
