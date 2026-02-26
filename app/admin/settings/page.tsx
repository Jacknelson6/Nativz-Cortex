'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Save,
  KeyRound,
  Calendar,
  ChevronRight,
  Loader2,
  User,
  Link as LinkIcon,
  Bell,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AvatarEditor } from '@/components/ui/avatar-editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserData {
  full_name: string;
  email: string;
  avatar_url: string | null;
  job_title: string | null;
}

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'scheduling', label: 'Scheduling Links', icon: LinkIcon },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
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

  // Notification preferences
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [inAppNotifications, setInAppNotifications] = useState(true);

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

      if (data) {
        setUser(data);
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
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Left sidebar nav */}
      <nav className="hidden lg:flex flex-col w-56 shrink-0 border-r border-nativz-border p-4 sticky top-16 h-[calc(100vh-4rem)]">
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
      <div className="flex-1 max-w-2xl mx-auto p-6 space-y-10">
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

        {/* Calendar Integration */}
        <div id="calendar" ref={(el) => { sectionRefs.current['calendar'] = el; }}>
          <h2 className="text-base font-semibold text-text-primary mb-4">Calendar Integration</h2>
          <Card>
            <Link
              href="/admin/settings/calendar"
              className="flex items-center gap-3 p-1 rounded-lg hover:bg-surface-hover transition-colors group -m-1"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Calendar size={16} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">Google Calendar & shoots</p>
                <p className="text-xs text-text-muted">Connect your calendar, manage shoot plans</p>
              </div>
              <ChevronRight size={14} className="text-text-muted group-hover:text-text-secondary transition-colors" />
            </Link>
          </Card>
        </div>

        {/* Notifications */}
        <div id="notifications" ref={(el) => { sectionRefs.current['notifications'] = el; }}>
          <h2 className="text-base font-semibold text-text-primary mb-4">Notifications</h2>
          <Card>
            <div className="space-y-4">
              <ToggleRow
                label="In-app notifications"
                description="Show notification bell alerts in Cortex"
                checked={inAppNotifications}
                onChange={setInAppNotifications}
              />
              <div className="border-t border-nativz-border" />
              <ToggleRow
                label="Email notifications"
                description="Receive email alerts for important events"
                checked={emailNotifications}
                onChange={setEmailNotifications}
              />
            </div>
          </Card>
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

        {/* Danger Zone */}
        <div id="danger" ref={(el) => { sectionRefs.current['danger'] = el; }}>
          <h2 className="text-base font-semibold text-red-400 mb-4">Danger Zone</h2>
          <Card className="border-red-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Delete account</p>
                <p className="text-xs text-text-muted">Permanently remove your account and all data</p>
              </div>
              <Button variant="secondary" size="sm" disabled>
                <AlertTriangle size={14} />
                Delete
              </Button>
            </div>
          </Card>
        </div>

        {/* Bottom spacer */}
        <div className="h-20" />
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
