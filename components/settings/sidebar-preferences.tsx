'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';

/**
 * Sidebar item catalog. Keep this in sync with NAV_SECTIONS in
 * components/layout/admin-sidebar.tsx — we need a static list here so the
 * settings page can render toggles without loading React's nav config.
 *
 * `unhidable: true` matches the UNHIDABLE_HREFS set in admin-sidebar.tsx
 * (Settings + Dashboard) — those still render but with a lock icon so the
 * user understands they can't be turned off.
 */
const ADMIN_SIDEBAR_ITEMS = [
  { section: 'Dashboard', items: [
    { href: '/admin/dashboard', label: 'Dashboard', unhidable: true },
    { href: '/admin/analytics', label: 'Analytics' },
  ] },
  { section: 'Intelligence', items: [
    { href: '/finder/new', label: 'Trend Finder' },
    { href: '/lab', label: 'Strategy Lab' },
    { href: '/admin/analyze-social', label: 'Competitor Spying' },
    { href: '/ads', label: 'Ad Generator' },
    { href: '/notes', label: 'Notes' },
  ] },
  { section: 'Manage', items: [
    { href: '/admin/clients', label: 'Clients' },
    { href: '/admin/tools', label: 'Tools' },
    { href: '/admin/settings', label: 'Settings', unhidable: true },
  ] },
] as const;

// Portal catalog stores ADMIN-side hrefs as the stable navKey (that's
// what the sidebar filter checks against). The portal shell remaps them
// to /portal/* at render time. Settings is reachable from the avatar
// popover on the portal so it doesn't appear in this list.
const PORTAL_SIDEBAR_ITEMS = [
  { section: '', items: [
    { href: '/admin/analytics', label: 'Analytics' },
    { href: '/finder/new', label: 'Trend Finder' },
    { href: '/lab', label: 'Strategy Lab' },
    { href: '/notes', label: 'Notes' },
  ] },
] as const;

interface SidebarPreferencesSectionProps {
  role?: 'admin' | 'viewer';
}

export function SidebarPreferencesSection({ role = 'admin' }: SidebarPreferencesSectionProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const catalog = role === 'admin' ? ADMIN_SIDEBAR_ITEMS : PORTAL_SIDEBAR_ITEMS;

  useEffect(() => {
    fetch('/api/account/sidebar-preferences')
      .then((res) => (res.ok ? res.json() : { hidden: [] }))
      .then((data) => setHidden(new Set(data.hidden ?? [])))
      .catch(() => setHidden(new Set()))
      .finally(() => setLoading(false));
  }, []);

  async function save(next: Set<string>) {
    setSaving(true);
    try {
      const res = await fetch('/api/account/sidebar-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: Array.from(next) }),
      });
      if (!res.ok) {
        toast.error('Failed to save');
        return;
      }
      toast.success('Sidebar updated — refresh to see it');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function toggle(href: string, unhidable: boolean | undefined) {
    if (unhidable) return;
    const next = new Set(hidden);
    if (next.has(href)) next.delete(href);
    else next.add(href);
    setHidden(next);
    void save(next);
  }

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-xs text-text-muted mb-4">
        Hide nav items you don't use. Changes apply after a refresh.
      </p>
      <div className="space-y-4">
        {catalog.map((section) => (
          <div key={section.section}>
            {section.section && (
              <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
                {section.section}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isHidden = hidden.has(item.href);
                const unhidable = 'unhidable' in item && item.unhidable === true;
                return (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => toggle(item.href, unhidable)}
                      disabled={saving || unhidable}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                        unhidable
                          ? 'border-nativz-border bg-surface/50 text-text-muted cursor-not-allowed'
                          : isHidden
                          ? 'border-nativz-border bg-background text-text-muted hover:bg-surface-hover cursor-pointer'
                          : 'border-nativz-border bg-surface text-text-primary hover:bg-surface-hover cursor-pointer'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        {item.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide">
                        {unhidable ? 'Always on' : isHidden ? 'Hidden' : 'Shown'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
