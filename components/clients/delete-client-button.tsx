'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

interface DeleteClientButtonProps {
  clientId: string;
  clientName: string;
}

/**
 * Delete-client action moved here from the client grid card on 2026-04-25.
 * Sits in the client detail page identity header next to Impersonate. On
 * success, routes back to /admin/clients.
 */
export function DeleteClientButton({ clientId, clientName }: DeleteClientButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
        const msg = [data.error ?? 'Failed to delete', data.details].filter(Boolean).join(' — ');
        throw new Error(msg);
      }
      toast.success(`${clientName} deleted`);
      router.push('/admin/clients');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete client');
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={deleting}
        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border-nativz-border hover:border-red-500/40"
        title={`Delete ${clientName}`}
        aria-label={`Delete ${clientName}`}
      >
        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        <span className="hidden sm:inline">Delete</span>
      </Button>

      <ConfirmDialog
        open={open}
        title="Delete client"
        description={`Delete "${clientName}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setOpen(false);
          void handleDelete();
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
