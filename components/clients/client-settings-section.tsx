'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Trash2, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Card } from '@/components/ui/card';

export function PortalAccessCard({
  canSearch,
  setCanSearch,
  canViewReports,
  setCanViewReports,
  canEditPreferences,
  setCanEditPreferences,
  canSubmitIdeas,
  setCanSubmitIdeas,
}: {
  canSearch: boolean;
  setCanSearch: (v: boolean) => void;
  canViewReports: boolean;
  setCanViewReports: (v: boolean) => void;
  canEditPreferences: boolean;
  setCanEditPreferences: (v: boolean) => void;
  canSubmitIdeas: boolean;
  setCanSubmitIdeas: (v: boolean) => void;
}) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary mb-4">Portal access</h2>
      <div className="space-y-4">
        <Toggle checked={canSearch} onChange={setCanSearch} label="Can run topic searches" description="Allow this client's portal users to run new searches" />
        <Toggle checked={canViewReports} onChange={setCanViewReports} label="Can view approved reports" description="Show approved reports in the client portal" />
        <Toggle checked={canEditPreferences} onChange={setCanEditPreferences} label="Can edit brand preferences" description="Allow portal users to update tone, topics, and seasonal priorities" />
        <Toggle checked={canSubmitIdeas} onChange={setCanSubmitIdeas} label="Can submit ideas" description="Allow portal users to submit content ideas and requests" />
      </div>
    </Card>
  );
}

export function DangerZone({
  clientId,
  clientName,
  isActive,
  setIsActive,
}: {
  clientId: string;
  clientName: string;
  isActive: boolean;
  setIsActive: (v: boolean) => void;
}) {
  const router = useRouter();
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  async function handleToggleActive(activate: boolean) {
    setDeactivating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: activate }),
      });
      if (!res.ok) { toast.error(`Failed to ${activate ? 'reactivate' : 'deactivate'}`); return; }
      setIsActive(activate);
      toast.success(`${clientName} ${activate ? 'reactivated' : 'deactivated'}`);
    } catch { toast.error('Something went wrong'); }
    finally { setDeactivating(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete client');
        return;
      }
      toast.success(`${clientName} deleted permanently`);
      router.push('/admin/clients');
    } catch { toast.error('Something went wrong'); }
    finally { setDeleting(false); }
  }

  return (
    <>
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-6">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-red-400" />
          <h2 className="text-base font-semibold text-red-400">Danger zone</h2>
        </div>
        <p className="text-sm text-text-muted mb-5">
          These actions affect the client&apos;s visibility and data.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text-primary">{isActive ? 'Deactivate' : 'Reactivate'} client</p>
              <p className="text-xs text-text-muted">{isActive ? 'Hide from portal and client list.' : 'Make visible in portal and client list.'}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => handleToggleActive(!isActive)}
              disabled={deactivating}
              className={isActive ? 'shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10' : 'shrink-0'}
            >
              <Power size={14} />
              {deactivating ? (isActive ? 'Deactivating...' : 'Activating...') : (isActive ? 'Deactivate' : 'Activate')}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-red-400">Delete client</p>
              <p className="text-xs text-text-muted">Permanently remove all data.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Trash2 size={14} />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-md rounded-xl border border-red-500/20 bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Delete {clientName}?</h3>
            <p className="text-sm text-text-muted mb-4">
              This will permanently delete all data associated with this client including searches, ideas, strategies, and settings. This action cannot be undone.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Type <span className="font-mono text-red-400">{clientName}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/20"
                placeholder={clientName}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={deleteConfirmText !== clientName || deleting}
                onClick={handleDelete}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={14} />
                {deleting ? 'Deleting...' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
