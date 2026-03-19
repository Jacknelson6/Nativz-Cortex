'use client';

import { useState, useMemo } from 'react';
import { Users, Briefcase, ListTodo, Mail, Plus, Loader2, CheckSquare, Calendar, Search, Crown, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { TeamMemberModal } from './team-member-modal';
import { toast } from 'sonner';

interface TeamMember {
  id: string;
  full_name: string;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
  is_active: boolean;
  user_id: string | null;
}

interface ClientInfo {
  name: string;
  slug: string;
}

interface TeamGridProps {
  initialMembers: TeamMember[];
  assignmentsByMember: Record<string, ClientInfo[]>;
  todoCountByUser: Record<string, number>;
  integrationsByUser: Record<string, { todoist: boolean; calendar: boolean }>;
  isSuperAdmin?: boolean;
  superAdminMemberIds?: string[];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function TeamGrid({
  initialMembers,
  assignmentsByMember,
  todoCountByUser,
  integrationsByUser,
  isSuperAdmin = false,
  superAdminMemberIds = [],
}: TeamGridProps) {
  const superAdminSet = useMemo(() => new Set(superAdminMemberIds), [superAdminMemberIds]);
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role: '',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Modal state
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) =>
      m.full_name.toLowerCase().includes(q) ||
      (m.role?.toLowerCase().includes(q)) ||
      (m.email?.toLowerCase().includes(q))
    );
  }, [members, searchQuery]);

  async function handleAdd() {
    if (!form.full_name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim() || null,
          role: form.role.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to add team member');
      }

      const newMember = await res.json();
      setMembers((prev) => [...prev, newMember]);
      setForm({ full_name: '', email: '', role: '' });
      setDialogOpen(false);
      toast.success('Team member added');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to add team member',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMember(e: React.MouseEvent, memberId: string) {
    e.stopPropagation(); // Don't open modal
    if (!confirm('Delete this team member? This cannot be undone.')) return;
    setDeletingId(memberId);
    try {
      const res = await fetch(`/api/team/${memberId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to delete');
      }
      setMembers(prev => prev.filter(m => m.id !== memberId));
      toast.success('Team member deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  function handleMemberUpdated(updated: TeamMember) {
    setMembers((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m)),
    );
    setSelectedMember(updated);
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Users size={22} className="text-accent-text" />
            Team
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            {members.length} active team member
            {members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isSuperAdmin && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus size={14} />
            Add member
          </Button>
        )}
      </div>

      {/* Search */}
      {members.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or role..."
            className="w-full rounded-lg border border-nativz-border bg-transparent pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text transition-colors"
          />
        </div>
      )}

      {/* Grid */}
      {members.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={32} />}
            title="No team members yet"
            description="Add team members to start managing assignments and tasks."
            action={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus size={14} />
                Add member
              </Button>
            }
          />
        </Card>
      ) : filteredMembers.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">
          No team members match &ldquo;{searchQuery}&rdquo;
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMembers.map((member) => {
            const clients = assignmentsByMember[member.id] ?? [];
            const openTodos = member.user_id ? (todoCountByUser[member.user_id] ?? 0) : 0;
            const integrations = member.user_id ? integrationsByUser[member.user_id] : null;

            return (
              <div
                key={member.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedMember(member)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedMember(member); }}
                className="text-left cursor-pointer"
              >
                <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5 hover:border-accent/30">
                  {isSuperAdmin && (
                    <button
                      onClick={(e) => handleDeleteMember(e, member.id)}
                      disabled={deletingId === member.id}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 rounded-md p-1 text-text-muted/30 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer z-10"
                      title="Delete team member"
                    >
                      {deletingId === member.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  )}
                  <div className="flex items-start gap-4">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.full_name}
                        className="h-16 w-16 rounded-full object-cover ring-2 ring-nativz-border shrink-0"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-accent/15 to-accent2/15 ring-2 ring-nativz-border flex items-center justify-center shrink-0">
                        <span className="text-base font-semibold text-text-secondary">
                          {getInitials(member.full_name)}
                        </span>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-text-primary truncate group-hover:text-accent-text transition-colors">
                          {member.full_name}
                        </h3>
                        {superAdminSet.has(member.id) && (
                          <span title="Super admin"><Crown size={12} className="text-amber-400 shrink-0" /></span>
                        )}
                        {member.user_id ? (
                          <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" title="Has account" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-amber-400/60 shrink-0" title="No account" />
                        )}
                      </div>
                      {member.role && (
                        <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                          <Briefcase size={10} />
                          {member.role}
                        </p>
                      )}
                      {member.email && (
                        <p className="text-[11px] text-text-muted/60 mt-0.5 flex items-center gap-1 truncate">
                          <Mail size={9} />
                          {member.email}
                        </p>
                      )}
                    </div>

                    {openTodos > 0 && (
                      <div className="flex items-center gap-1 text-xs text-text-muted shrink-0">
                        <ListTodo size={12} />
                        <span>{openTodos}</span>
                      </div>
                    )}
                  </div>

                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Team member detail modal */}
      <TeamMemberModal
        member={selectedMember}
        assignments={selectedMember ? (assignmentsByMember[selectedMember.id] ?? []) : []}
        todoCount={selectedMember?.user_id ? (todoCountByUser[selectedMember.user_id] ?? 0) : 0}
        onClose={() => setSelectedMember(null)}
        onMemberUpdated={handleMemberUpdated}
        isSuperAdmin={isSuperAdmin}
      />

      {/* Add member dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Add team member"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Full name *
            </label>
            <input
              value={form.full_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, full_name: e.target.value }))
              }
              placeholder="Jane Smith"
              className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="jane@nativz.com"
              className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Role
            </label>
            <input
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value }))
              }
              placeholder="e.g. Videographer, Editor, Strategist"
              className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Adding...' : 'Add member'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
