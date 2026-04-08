'use client';

import { useState, useMemo } from 'react';
import { Users, Briefcase, ListTodo, Mail, Plus, Loader2, Search, Crown, Trash2, Clock, FileSearch, Shield } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { TeamMemberModal } from './team-member-modal';
import { formatRelativeTime } from '@/lib/utils/format';
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
  lastSignInByUser?: Record<string, string | null>;
  searchCountByUser?: Record<string, number>;
  authEmailByUser?: Record<string, string>;
  userRoleByUser?: Record<string, string>;
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
  lastSignInByUser = {},
  searchCountByUser = {},
  authEmailByUser = {},
  userRoleByUser = {},
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
    e.stopPropagation();
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
      setConfirmDeleteId(null);
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
          <h1 className="ui-page-title flex items-center gap-2">
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMembers.map((member) => {
            const clients = assignmentsByMember[member.id] ?? [];
            const openTodos = member.user_id ? (todoCountByUser[member.user_id] ?? 0) : 0;
            const lastSignIn = member.user_id ? lastSignInByUser[member.user_id] : null;
            const searches = member.user_id ? (searchCountByUser[member.user_id] ?? 0) : 0;
            const authEmail = member.user_id ? authEmailByUser[member.user_id] : null;
            const userRole = member.user_id ? userRoleByUser[member.user_id] : null;

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
                  {/* Delete button — super_admin only, with confirmation */}
                  {isSuperAdmin && (
                    <div className="absolute top-3 right-3 z-10">
                      {confirmDeleteId === member.id ? (
                        <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1">
                          <span className="text-[10px] text-red-400 mr-1">Delete?</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteMember(e, member.id); }}
                            disabled={deletingId === member.id}
                            className="text-[10px] text-red-400 font-medium hover:text-red-300 cursor-pointer"
                          >
                            {deletingId === member.id ? <Loader2 size={10} className="animate-spin" /> : 'Yes'}
                          </button>
                          <span className="text-red-500/30">|</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="text-[10px] text-text-muted hover:text-text-secondary cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(member.id); }}
                          className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-text-muted/30 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                          title="Delete team member"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Header: avatar + name */}
                  <div className="flex items-center gap-3 mb-3">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.full_name}
                        className="h-11 w-11 rounded-full object-cover ring-2 ring-nativz-border shrink-0"
                      />
                    ) : (
                      <div className="h-11 w-11 rounded-full bg-gradient-to-br from-accent/15 to-accent2/15 ring-2 ring-nativz-border flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-text-secondary">
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
                          <span title="Super admin"><Crown size={11} className="text-amber-400 shrink-0" /></span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {member.role && (
                          <span className="text-[11px] text-text-muted flex items-center gap-1">
                            <Briefcase size={9} />
                            {member.role}
                          </span>
                        )}
                        {userRole && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            userRole === 'admin' ? 'bg-accent/[0.08] text-accent-text' : 'bg-surface-hover text-text-muted'
                          }`}>
                            {userRole}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info rows */}
                  <div className="space-y-1.5 text-[11px]">
                    {/* Email */}
                    {(authEmail || member.email) && (
                      <div className="flex items-center gap-2 text-text-muted/70">
                        <Mail size={10} className="shrink-0" />
                        <span className="truncate">{authEmail ?? member.email}</span>
                      </div>
                    )}

                    {/* Last sign in */}
                    {member.user_id && (
                      <div className="flex items-center gap-2 text-text-muted/70">
                        <Clock size={10} className="shrink-0" />
                        <span>
                          {lastSignIn
                            ? `Last active ${formatRelativeTime(lastSignIn)}`
                            : 'Never signed in'}
                        </span>
                      </div>
                    )}

                    {!member.user_id && (
                      <div className="flex items-center gap-2 text-amber-400/70">
                        <Shield size={10} className="shrink-0" />
                        <span>No account</span>
                      </div>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-nativz-border/50">
                    <div className="flex items-center gap-1 text-[11px] text-text-muted/60">
                      <Briefcase size={10} />
                      <span>{clients.length} client{clients.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-text-muted/60">
                      <ListTodo size={10} />
                      <span>{openTodos} task{openTodos !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-text-muted/60">
                      <FileSearch size={10} />
                      <span>{searches} search{searches !== 1 ? 'es' : ''}</span>
                    </div>
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
