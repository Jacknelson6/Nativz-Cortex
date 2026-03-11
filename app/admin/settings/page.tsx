'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import {
  Save,
  Key,
  KeyRound,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Loader2,
  User,
  Link as LinkIcon,
  Bell,
  Users,
  Unlink,
  CheckSquare,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AvatarEditor } from '@/components/ui/avatar-editor';
import { NotificationPreferencesSection } from '@/components/settings/notification-preferences';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserData {
  full_name: string;
  email: string;
  avatar_url: string | null;
  job_title: string | null;
  nango_connection_id: string | null;
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

  // Notification preferences are now managed by NotificationPreferencesSection

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    async function fetchUser() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // Fetch profile fields from Supabase
      const { data } = await supabase
        .from('users')
        .select('full_name, email, avatar_url, job_title, nango_connection_id')
        .eq('id', authUser.id)
        .single();

      // Fetch Todoist connection status from API (bypasses RLS)
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

  // Intersection observer for active section
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    );

    for (const section of SECTIONS) {
      const el = sectionRefs.current[section.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
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
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
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
      <div className="flex-1 overflow-y-auto min-w-0">
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
            <Button type="submit" variant="secondary" disabled={changingPassword || !newPassword}>
              <KeyRound size={16} />
              {changingPassword ? 'Changing...' : 'Change password'}
            </Button>
          </form>
        </div>


        {/* Bottom spacer */}
        <div className="h-20" />
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle Row
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <div>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-hover'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Scheduling Links Section
// ---------------------------------------------------------------------------

function SchedulingLinksSection() {
  const [nativzLink, setNativzLink] = useState('');
  const [acLink, setAcLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/scheduling');
        if (!res.ok) return;
        const { settings } = await res.json();
        for (const s of settings) {
          if (s.agency === 'nativz') setNativzLink(s.scheduling_link || '');
          if (s.agency === 'ac') setAcLink(s.scheduling_link || '');
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function saveLink(agency: string, link: string) {
    setSaving(agency);
    try {
      const res = await fetch('/api/settings/scheduling', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency, scheduling_link: link.trim() }),
      });
      if (res.ok) {
        toast.success(`${agency === 'nativz' ? 'Nativz' : 'Anderson Collaborative'} scheduling link saved.`);
      } else {
        toast.error('Failed to save.');
      }
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <p className="text-xs text-text-muted mb-4">Links included in client scheduling emails</p>
      {loading ? (
        <p className="text-sm text-text-muted py-4 text-center">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="nativz_scheduling_link"
                label="Nativz"
                value={nativzLink}
                onChange={(e) => setNativzLink(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <Button
              size="sm"
              onClick={() => saveLink('nativz', nativzLink)}
              disabled={saving === 'nativz'}
            >
              {saving === 'nativz' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="ac_scheduling_link"
                label="Anderson Collaborative"
                value={acLink}
                onChange={(e) => setAcLink(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <Button
              size="sm"
              onClick={() => saveLink('ac', acLink)}
              disabled={saving === 'ac'}
            >
              {saving === 'ac' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Google Calendar Section
// ---------------------------------------------------------------------------

function GoogleCalendarSection({
  connected,
  onConnectionChange,
}: {
  connected: boolean;
  onConnectionChange: (connected: boolean) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      // Get a session token from the backend
      const res = await fetch('/api/nango/connect', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Could not start calendar auth');
        return;
      }
      const { token } = await res.json();

      // Open the Nango OAuth popup
      const { default: Nango } = await import('@nangohq/frontend');
      const nango = new Nango({ connectSessionToken: token });
      const result = await nango.auth('google-calendar');

      // Store the connectionId via callback endpoint
      const callbackRes = await fetch('/api/nango/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: result.connectionId }),
      });

      if (!callbackRes.ok) {
        toast.error('Connected to Google but failed to save. Try reconnecting.');
        return;
      }

      toast.success('Google Calendar connected');
      onConnectionChange(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      if (message.includes('closed') || message.includes('cancelled')) {
        toast.error('Calendar connection was cancelled');
      } else {
        toast.error('Failed to connect calendar. Try again.');
      }
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      // Clear the nango_connection_id by sending null
      const res = await fetch('/api/nango/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: '' }),
      });

      if (!res.ok) {
        toast.error('Failed to disconnect calendar.');
        return;
      }

      // Also clear it directly via account patch
      await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nango_connection_id: null }),
      });

      toast.success('Google Calendar disconnected');
      onConnectionChange(false);
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
          <Image src="/icons/google-calendar.svg" alt="Google Calendar" width={22} height={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Google Calendar</h3>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                <Check size={10} />
                Connected
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            {connected
              ? 'Syncs shoot events from your calendar'
              : 'Connect to detect upcoming shoots from your calendar'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {connected ? (
            <>
              <Link href="/admin/settings/calendar">
                <Button variant="outline" size="sm">
                  <Calendar size={12} />
                  Manage
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-text-muted hover:text-red-400"
              >
                {disconnecting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Unlink size={12} />
                )}
                Disconnect
              </Button>
            </>
          ) : (
            <Button onClick={handleConnect} disabled={connecting} size="sm">
              {connecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Calendar size={14} />
              )}
              {connecting ? 'Connecting...' : 'Connect Google Calendar'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Todoist Section
// ---------------------------------------------------------------------------

interface TodoistProject {
  id: string;
  name: string;
}

function TodoistSection({
  connected,
  projectId,
  syncedAt,
  onConnectionChange,
  onSyncComplete,
}: {
  connected: boolean;
  projectId: string | null;
  syncedAt: string | null;
  onConnectionChange: (connected: boolean) => void;
  onSyncComplete: (syncedAt: string) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [projects, setProjects] = useState<TodoistProject[]>([]);
  const [selectedProject, setSelectedProject] = useState(projectId ?? '');
  const [savingProject, setSavingProject] = useState(false);

  // Load projects when connected
  useEffect(() => {
    if (!connected) return;
    async function load() {
      try {
        const res = await fetch('/api/todoist/connect');
        if (!res.ok) return;
        const data = await res.json();
        if (data.projects) setProjects(data.projects);
        if (data.project_id) setSelectedProject(data.project_id);
      } catch {
        // silent
      }
    }
    load();
  }, [connected]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast.error('Enter your Todoist API key.');
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch('/api/todoist/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to connect.');
        return;
      }
      toast.success('Todoist connected');
      if (data.projects) setProjects(data.projects);
      onConnectionChange(true);
      setApiKey('');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/todoist/connect', { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to disconnect.');
        return;
      }
      toast.success('Todoist disconnected');
      onConnectionChange(false);
      setProjects([]);
      setSelectedProject('');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/todoist/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Sync failed.');
        return;
      }
      const { pulled, pushed, errors } = data;
      if (errors?.length) {
        toast.error(`Sync had ${errors.length} error(s). ${pulled} pulled, ${pushed} pushed.`);
      } else {
        toast.success(`Synced: ${pulled} pulled, ${pushed} pushed`);
      }
      onSyncComplete(new Date().toISOString());
    } catch {
      toast.error('Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleProjectChange(pid: string) {
    setSelectedProject(pid);
    setSavingProject(true);
    try {
      await fetch('/api/todoist/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: '_keep', project_id: pid || null }),
      });
      // Silently save — no need for toast on project change
    } catch {
      // silent
    } finally {
      setSavingProject(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
          <Image src="/icons/todoist.svg" alt="Todoist" width={22} height={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Todoist</h3>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                <Check size={10} />
                Connected
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            {connected
              ? syncedAt
                ? `Two-way task sync · Last synced ${new Date(syncedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : 'Two-way task sync · Not yet synced'
              : 'Sync tasks between Cortex and Todoist'}
          </p>
        </div>

        {connected && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              {syncing ? 'Syncing...' : 'Sync now'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-text-muted hover:text-red-400"
            >
              {disconnecting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Unlink size={12} />
              )}
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {connected && projects.length > 0 && (
        <div className="mt-4 pt-4 border-t border-nativz-border">
          <label className="text-xs text-text-muted block mb-1.5">Sync project</label>
          <select
            value={selectedProject}
            onChange={(e) => handleProjectChange(e.target.value)}
            disabled={savingProject}
            className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All projects (inbox)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-text-muted mt-1">Only sync tasks from this Todoist project</p>
        </div>
      )}

      {!connected && (
        <form onSubmit={handleConnect} className="mt-4 pt-4 border-t border-nativz-border">
          <label className="text-xs text-text-muted block mb-1.5">
            API key from{' '}
            <a
              href="https://app.todoist.com/app/settings/integrations/developer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-text hover:underline"
            >
              Todoist settings
            </a>
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                id="todoist_api_key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key..."
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary p-0.5"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button type="submit" size="sm" disabled={connecting || !apiKey.trim()}>
              {connecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckSquare size={14} />
              )}
              {connecting ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// API Keys Section
// ---------------------------------------------------------------------------

interface ApiKeyData {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
  plaintext?: string;
}

const ALL_SCOPES = ['tasks', 'clients', 'shoots', 'scheduler', 'search', 'team'] as const;

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    try {
      const res = await fetch('/api/api-keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newKeyName.trim()) {
      toast.error('Name is required');
      return;
    }
    if (newKeyScopes.length === 0) {
      toast.error('Select at least one scope');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create key');
        return;
      }
      setCreatedKey(data.key.plaintext);
      setKeys((prev) => [data.key, ...prev]);
      setShowCreate(false);
      setNewKeyName('');
      setNewKeyScopes([]);
      toast.success('API key created');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to revoke key');
        return;
      }
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, is_active: false } : k)));
      toast.success('API key revoked');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleDelete(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/api-keys/${id}?permanent=true`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to delete key');
        return;
      }
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success('API key deleted');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setRevokingId(null);
    }
  }

  function toggleScope(scope: string) {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function copyKey() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <Card><p className="text-sm text-text-muted py-4 text-center">Loading...</p></Card>;
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-text-muted">
              API keys allow external agents and scripts to access Cortex data.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <KeyRound size={14} />
            Create key
          </Button>
        </div>

        {keys.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">No API keys yet</p>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center gap-3 rounded-lg border border-nativz-border p-3 ${!key.is_active ? 'opacity-50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{key.name}</span>
                    {!key.is_active && (
                      <span className="text-[10px] text-red-400 font-medium">Revoked</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted font-mono mt-0.5">{key.key_prefix}...</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {key.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-text"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-muted/60 mt-1">
                    Created {new Date(key.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {key.last_used_at && (
                      <> · Last used {new Date(key.last_used_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                    )}
                  </p>
                </div>
                {key.is_active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(key.id)}
                    disabled={revokingId === key.id}
                    className="text-text-muted hover:text-red-400 shrink-0"
                  >
                    {revokingId === key.id ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                    Revoke
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(key.id)}
                    disabled={revokingId === key.id}
                    className="text-text-muted hover:text-red-400 shrink-0"
                  >
                    {revokingId === key.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create key dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-nativz-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold text-text-primary mb-4">Create API key</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Name</label>
                <input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Claude agent, n8n workflow"
                  className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-2">Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_SCOPES.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        newKeyScopes.includes(scope)
                          ? 'bg-accent/15 border-accent/30 text-accent-text'
                          : 'bg-transparent border-nativz-border text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={creating}>
                  {creating && <Loader2 size={14} className="animate-spin" />}
                  {creating ? 'Creating...' : 'Create key'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Created key display */}
      {createdKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-nativz-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold text-text-primary mb-2">Your API key</h3>
            <p className="text-xs text-amber-400 mb-4">
              Copy this key now — you won&apos;t be able to see it again.
            </p>
            <code className="block rounded-lg bg-background border border-nativz-border px-3 py-2.5 text-sm text-text-primary font-mono break-all select-all">
              {createdKey}
            </code>
            <div className="flex justify-end gap-2 mt-4">
              <Button size="sm" onClick={copyKey} variant="outline">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" onClick={() => setCreatedKey(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
