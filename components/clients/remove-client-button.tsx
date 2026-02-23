'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function RemoveClientButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (!confirm(`Remove ${clientName} from the clients board?`)) return;

    setRemoving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });

      if (!res.ok) {
        toast.error('Failed to remove client');
        return;
      }

      toast.success(`${clientName} removed`);
      router.push('/admin/clients');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRemove} disabled={removing}>
      {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      Remove
    </Button>
  );
}
