'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Save, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ImageUpload } from '@/components/ui/image-upload';

interface UserData {
  full_name: string;
  email: string;
  avatar_url: string | null;
}

export default function AdminSettingsPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    async function fetchUser() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data } = await supabase
        .from('users')
        .select('full_name, email, avatar_url')
        .eq('id', authUser.id)
        .single();

      if (data) {
        setUser(data);
        setFullName(data.full_name);
        setAvatarUrl(data.avatar_url);
      }
      setLoading(false);
    }
    fetchUser();
  }, []);

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
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-text-primary">Account settings</h1>

      {/* Profile */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Profile</h2>
          <div className="space-y-4">
            <div className="flex justify-center">
              <ImageUpload value={avatarUrl} onChange={setAvatarUrl} size="lg" />
            </div>
            <Input
              id="full_name"
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
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

        <Button type="submit" disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving...' : 'Save profile'}
        </Button>
      </form>

      {/* Password */}
      <form onSubmit={handleChangePassword} className="space-y-6">
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Change password</h2>
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
  );
}
