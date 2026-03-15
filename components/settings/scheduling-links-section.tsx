'use client';

import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SchedulingLinksSection() {
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
