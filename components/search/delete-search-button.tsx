'use client';

import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function DeleteSearchButton({ searchId }: { searchId: string }) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    setDeleting(true);
    try {
      const res = await fetch(`/api/search/${searchId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete');
        return;
      }
      toast.success('Search deleted');
      router.refresh();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="cursor-pointer p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
      title="Delete failed search"
    >
      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );
}
