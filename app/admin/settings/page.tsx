'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Save,
  Key,
  KeyRound,
  User,
  Link as LinkIcon,
  Bell,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AvatarEditor } from '@/components/ui/avatar-editor';
import { NotificationPreferencesSection } from '@/components/settings/notification-preferences';
import { SchedulingLinksSection } from '@/components/settings/scheduling-links-section';
import { TodoistSection } from '@/components/settings/todoist-section';
import { ApiKeysSection } from '@/components/settings/api-keys-section';
import { TrustPolicyModal } from '@/components/settings/trust-policy-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserData {
  full_name: string;
  email: string;
  avatar_url: string | null;
  job_title: string | null;
  todoist_api_key: string | null;
  todoist_project_id: string | null;
  todoist_synced_at: string | null;
}

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'scheduling', label: 'Scheduling Links', icon: LinkIcon },
  { id: 'connections', label: 'Connections', icon: LinkIcon },
  { id: 'api-keys', label: 'API keys', icon: Key },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'security', label: 'Security', icon: KeyRound },
] as const;

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminSettingsPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');

  // Profile form state
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    async function fetchUser() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data } = await supabase
        .from('users')
        .select('full_name, email, avatar_url, job_title')
        .eq('id', authUser.id)
        .single();

      let todoistData = { connected: false, project_id: null as string | null, synced_at: null as string | null };
      try {
        const todoistRes = await fetch('/api/todoist/connect');
        if (todoistRes.ok) {
          const td = await todoistRes.json();
          todoistData = { connected: td.connected, project_id: td.project_id ?? null, synced_at: td.synced_at ?? null };
        }
      } catch { /* silent */ }

      if (data) {
        setUser({
          ...data,
          todoist_api_key: todoistData.connected ? 'connected' : null,
          todoist_project_id: todoistData.project_id,
          todoist_synced_at: todoistData.synced_at,
        });
        setFullName(data.full_name);
        setAvatarUrl(data.avatar_url);
        setJobTitle(data.job_title || '');
      }
      setLoading(false);
    }
    fetchUser();
  }, []);

  // Scroll-driven active section tracking
  useEffect(() => {
    const scrollContainer = document.querySelector('[data-settings-scroll]');
    if (!scrollContainer) return;

    function handleScroll() {
      const container = scrollContainer!;
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;

      // If scrolled to the very bottom, highlight the last section
      if (container.scrollHeight - scrollTop - containerHeight < 40) {
        setActiveSection(SECTIONS[SECTIONS.length - 1].id);
        return;
      }

      // Find the section whose top is closest to (but above) 20% from the top
      const threshold = scrollTop + containerHeight * 0.2;
      let current: string = SECTIONS[0].id;
      for (const section of SECTIONS) {
        const el = sectionRefs.current[section.id];
        if (el && el.offsetTop <= threshold) {
          current = section.id;
        }
      }
      setActiveSection(current);
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // set initial state

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [loading]);

  function scrollToSection(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Name is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          avatar_url: avatarUrl,
          job_title: jobTitle.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to update profile.');
      } else {
        toast.success('Profile updated.');
      }
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to change password.');
      } else {
        toast.success('Password changed.');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-text-muted">Loading...</div>;
  }

  if (!user) {
    return <div className="p-6 text-sm text-red-400">Could not load account.</div>;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left sidebar nav */}
      <nav className="hidden lg:flex flex-col w-56 shrink-0 border-r border-nativz-border p-4 overflow-y-auto">
        <h1 className="text-lg font-semibold text-text-primary mb-1">Settings</h1>
        <p className="text-xs text-text-muted mb-6">Manage your account</p>
        <ul className="space-y-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-accent/10 text-accent-text font-medium'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                  }`}
                >
                  <Icon size={15} />
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto min-w-0" data-settings-scroll>
      <div className="max-w-2xl mx-auto p-6 space-y-10">
        {/* Mobile header */}
        <div className="lg:hidden">
          <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
          <p className="text-sm text-text-muted mt-0.5">Manage your account</p>
        </div>

        {/* Profile */}
        <div id="profile" ref={(el) => { sectionRefs.current['profile'] = el; }}>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">Profile</h2>
              <Button type="submit" disabled={saving} size="sm">
                <Save size={14} />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
            <Card>
              <div className="space-y-4">
                <div className="flex justify-center">
                  <AvatarEditor value={avatarUrl} onChange={setAvatarUrl} size="lg" />
                </div>
                <Input
                  id="full_name"
                  label="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
                <Input
                  id="job_title"
                  label="Role"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Chief Editing Officer"
                />
                <Input
                  id="email"
                  label="Email"
                  type="email"
                  value={user.email}
                  disabled
                />
                <p className="text-xs text-text-muted">Email cannot be changed. Contact support if needed.</p>
              </div>
            </Card>
          </form>
        </div>

        {/* Scheduling Links */}
        <div id="scheduling" ref={(el) => { sectionRefs.current['scheduling'] = el; }}>
          <h2 className="text-base font-semibold text-text-primary mb-4">Scheduling Links</h2>
          <SchedulingLinksSection />
        </div>

        {/* Connections */}
        <div id="connections" ref={(el) => { sectionRefs.current['connections'] = el; }}>
          <h2 className="text-base font-semibold text-text-primary mb-4">Connections</h2>
          <div className="space-y-4">
            <TodoistSection
              connected={!!user.todoist_api_key}
              projectId={user.todoist_project_id}
              syncedAt={user.todoist_synced_at}
              onConnectionChange={(connected) =>
                setUser((prev) =>
                  prev
                    ? {
                        ...prev,
                        todoist_api_key: connected ? 'connected' : null,
                        todoist_project_id: connected ? prev.todoist_project_id : null,
                        todoist_synced_at: connected ? prev.todoist_synced_at : null,
                      }
                    : prev,
                )
              }
              onSyncComplete={(syncedAt) =>
                setUser((prev) => (prev ? { ...prev, todoist_synced_at: syncedAt } : prev))
              }
            />
          </div>
        </div>

        {/* API Keys */}
        <div id="api-keys" ref={(el) => { sectionRefs.current['api-keys'] = el; }}>
          <h2 className="text-base font-semibold text-text-primary mb-4">API keys</h2>
          <ApiKeysSection />
        </div>

        {/* Notifications */}
        <div id="notifications" ref={(el) => { sectionRefs.current['notifications'] = el; }}>
          <h2 className="text-base font-semibold text-text-primary mb-4">Notifications</h2>
          <NotificationPreferencesSection />
        </div>

        {/* Team */}
        <div id="team" ref={(el) => { sectionRefs.current['team'] = el; }}>
          <h2 className="text-base font-semibold text-text-primary mb-4">Team</h2>
          <Card>
            <p className="text-sm text-text-muted">
              Team management and invite links coming soon.
            </p>
          </Card>
        </div>

        {/* Security */}
        <div id="security" ref={(el) => { sectionRefs.current['security'] = el; }}>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <h2 className="text-base font-semibold text-text-primary">Security</h2>
            <Card>
              <h3 className="text-sm font-medium text-text-primary mb-4">Change password</h3>
              <div className="space-y-4">
                <Input
                  id="new_password"
                  label="New password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
                <Input
                  id="confirm_password"
                  label="Confirm password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </div>
            </Card>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary" disabled={changingPassword || !newPassword}>
                <KeyRound size={16} />
                {changingPassword ? 'Changing...' : 'Change password'}
              </Button>
            </div>
          </form>
          <div className="mt-2">
            <TrustPolicyModal />
          </div>
        </div>


        {/* Bottom spacer */}
        <div className="h-20" />
      </div>
      </div>
    </div>
  );
}
