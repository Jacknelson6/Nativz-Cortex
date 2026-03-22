'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';

export function ClientMoodboardEmpty({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await fetch('/api/analysis/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${clientName} moodboard`,
          client_id: clientId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create moodboard');
      }
      const board = await res.json() as { id: string };
      toast.success('Moodboard created');
      router.push(`/admin/analysis/${board.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create moodboard');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="max-w-md w-full">
        <EmptyState
          icon={<Palette size={32} />}
          title="No moodboard yet"
          description="Create one board for this client to collect references and review creative direction together on calls."
          action={
            <Button onClick={handleCreate} disabled={loading} size="sm">
              {loading ? 'Creating…' : 'Create moodboard'}
            </Button>
          }
        />
      </div>
    </div>
  );
}
