'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, Loader2, Crown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';

interface TeamMember {
  id: string;
  full_name: string;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

interface Assignment {
  id: string;
  client_id: string;
  team_member_id: string;
  role: string | null;
  is_lead: boolean;
  team_member: TeamMember;
}

interface ClientTeamCardProps {
  clientId: string;
  clientName: string;
}

export function ClientTeamCard({ clientId, clientName }: ClientTeamCardProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allTeamMembers, setAllTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [assignRole, setAssignRole] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/assignments`);
      if (res.ok) setAssignments(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  async function openAddDialog() {
    setSelectedMemberId('');
    setAssignRole('');
    // Fetch all team members to show unassigned ones
    try {
      const res = await fetch('/api/team');
      if (res.ok) setAllTeamMembers(await res.json());
    } catch { /* ignore */ }
    setDialogOpen(true);
  }

  const assignedIds = new Set(assignments.map((a) => a.team_member_id));
  const unassigned = allTeamMembers.filter((m) => !assignedIds.has(m.id));

  async function handleAssign() {
    if (!selectedMemberId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_member_id: selectedMemberId,
          role: assignRole.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to assign');
        return;
      }
      const created = await res.json();
      setAssignments((prev) => [...prev, created]);
      setDialogOpen(false);
      toast.success('Team member assigned');
    } catch {
      toast.error('Failed to assign team member');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(assignmentId: string) {
    try {
      const res = await fetch(`/api/clients/${clientId}/assignments/${assignmentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      toast.success('Team member removed');
    } catch {
      toast.error('Failed to remove team member');
    }
  }

  function getInitials(name: string) {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Nativz team</h2>
          <Button variant="ghost" size="sm" onClick={openAddDialog}>
            <Plus size={14} />
            Add
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : assignments.length === 0 ? (
          <EmptyState
            icon={<Users size={24} />}
            title="No team assigned"
            description={`Assign team members to ${clientName}.`}
          />
        ) : (
          <div className="space-y-2">
            {assignments.map((assignment) => {
              const member = assignment.team_member;
              return (
                <div key={assignment.id} className="group flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3 transition-colors hover:bg-surface-hover/30">
                  {member.avatar_url ? (
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={member.avatar_url} alt={member.full_name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent-text text-xs font-medium">
                      {getInitials(member.full_name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-primary truncate">{member.full_name}</p>
                      {assignment.is_lead && (
                        <Crown size={12} className="text-yellow-400 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {(assignment.role || member.role) && (
                        <p className="text-xs text-text-muted truncate">{assignment.role || member.role}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(assignment.id)}
                    className="cursor-pointer shrink-0 rounded-lg p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove from account"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Assign team member dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Assign team member">
        <div className="space-y-3">
          {unassigned.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">All team members are already assigned to this client.</p>
          ) : (
            <>
              <div>
                <label htmlFor="team_member_select" className="block text-sm font-medium text-text-secondary mb-1.5">Team member</label>
                <select
                  id="team_member_select"
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                >
                  <option value="">Select a team member...</option>
                  {unassigned.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}{m.role ? ` — ${m.role}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assign_role" className="block text-sm font-medium text-text-secondary mb-1.5">Role on this account</label>
                <input
                  id="assign_role"
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value)}
                  placeholder="e.g. Account Manager, Editor"
                  className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            {unassigned.length > 0 && (
              <Button size="sm" onClick={handleAssign} disabled={saving || !selectedMemberId}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Assign
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
