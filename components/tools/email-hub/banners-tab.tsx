'use client';

import { memo, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Gift,
  Info,
  Megaphone,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { SkeletonRows } from '@/components/ui/loading-skeletons';
import { LabeledInput } from './contacts-tab';
import type { EmailHubClientOption } from './email-hub-client';
import { TONE_PILL, bannerStatusTone } from './_status-tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Style = 'info' | 'warning' | 'success' | 'error' | 'event' | 'promo';
type Icon = 'info' | 'alert' | 'calendar' | 'sparkles' | 'gift' | 'check' | 'bell';
type Position = 'top' | 'sidebar' | 'modal';
type Agency = 'nativz' | 'anderson';
type Role = 'admin' | 'viewer';

type Banner = {
  id: string;
  title: string;
  description: string | null;
  style: Style;
  icon: Icon;
  link_url: string | null;
  link_text: string | null;
  start_at: string;
  end_at: string | null;
  event_at: string | null;
  position: Position;
  priority: number;
  target_agency: Agency | null;
  target_role: Role | null;
  target_client_id: string | null;
  active: boolean;
  dismissible: boolean;
  created_at: string;
  updated_at: string;
};

type Draft = {
  title: string;
  description: string;
  style: Style;
  icon: Icon;
  link_url: string;
  link_text: string;
  start_at: string;
  end_at: string;
  event_at: string;
  position: Position;
  priority: number;
  target_agency: Agency | '';
  target_role: Role | '';
  target_client_id: string;
  active: boolean;
  dismissible: boolean;
};

const EMPTY_DRAFT: Draft = {
  title: '',
  description: '',
  style: 'info',
  icon: 'info',
  link_url: '',
  link_text: '',
  start_at: '',
  end_at: '',
  event_at: '',
  position: 'top',
  priority: 0,
  target_agency: '',
  target_role: '',
  target_client_id: '',
  active: true,
  dismissible: true,
};

// ---------------------------------------------------------------------------
// Style map — drives banner color + icon lookup for both preview + runtime
// renderer. Kept in one place so the preview in the composer always matches
// what a user actually sees in the shell.
// ---------------------------------------------------------------------------

const STYLE_CLASSES: Record<Style, { container: string; title: string; icon: string; link: string }> = {
  info: {
    container: 'bg-sky-500/10 border-sky-500/30',
    title: 'text-sky-500',
    icon: 'text-sky-500',
    link: 'text-sky-500 hover:text-sky-400',
  },
  warning: {
    container: 'bg-amber-500/10 border-amber-500/30',
    title: 'text-amber-500',
    icon: 'text-amber-500',
    link: 'text-amber-500 hover:text-amber-400',
  },
  success: {
    container: 'bg-emerald-500/10 border-emerald-500/30',
    title: 'text-emerald-500',
    icon: 'text-emerald-500',
    link: 'text-emerald-500 hover:text-emerald-400',
  },
  error: {
    container: 'bg-rose-500/10 border-rose-500/30',
    title: 'text-rose-500',
    icon: 'text-rose-500',
    link: 'text-rose-500 hover:text-rose-400',
  },
  event: {
    container: 'bg-violet-500/10 border-violet-500/30',
    title: 'text-violet-400',
    icon: 'text-violet-400',
    link: 'text-violet-400 hover:text-violet-300',
  },
  promo: {
    container: 'bg-fuchsia-500/10 border-fuchsia-500/30',
    title: 'text-fuchsia-400',
    icon: 'text-fuchsia-400',
    link: 'text-fuchsia-400 hover:text-fuchsia-300',
  },
};

const ICON_COMPONENTS: Record<Icon, typeof Info> = {
  info: Info,
  alert: AlertTriangle,
  calendar: Calendar,
  sparkles: Sparkles,
  gift: Gift,
  check: CheckCircle2,
  bell: Bell,
};

const STYLE_LABELS: { value: Style; label: string }[] = [
  { value: 'info', label: 'Info (blue)' },
  { value: 'warning', label: 'Warning (orange)' },
  { value: 'success', label: 'Success (green)' },
  { value: 'error', label: 'Error (red)' },
  { value: 'event', label: 'Event (purple)' },
  { value: 'promo', label: 'Promo (pink)' },
];

const ICON_LABELS: { value: Icon; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'alert', label: 'Alert' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'sparkles', label: 'Sparkles' },
  { value: 'gift', label: 'Gift' },
  { value: 'check', label: 'Check' },
  { value: 'bell', label: 'Bell' },
];

// ---------------------------------------------------------------------------
// Template presets — appear as quick-start cards on Create (hidden on Edit).
// Matches the four-card layout in the RankPrompt composer.
// ---------------------------------------------------------------------------

type Template = {
  key: string;
  label: string;
  description: string;
  icon: Icon;
  apply: (d: Draft) => Draft;
};

const TEMPLATES: Template[] = [
  {
    key: 'webinar',
    label: 'Webinar',
    description: 'Announce upcoming webinars or live events',
    icon: 'calendar',
    apply: (d) => ({
      ...d,
      style: 'event',
      icon: 'calendar',
      title: d.title || 'Webinar: ',
      description: d.description || 'Join us for an exclusive webinar…',
      link_text: d.link_text || 'Register',
    }),
  },
  {
    key: 'product',
    label: 'Product update',
    description: 'Share new features or improvements',
    icon: 'sparkles',
    apply: (d) => ({
      ...d,
      style: 'promo',
      icon: 'sparkles',
      title: d.title || 'New feature: ',
      description: d.description || 'Check out what we just shipped.',
      link_text: d.link_text || "What's new",
    }),
  },
  {
    key: 'maintenance',
    label: 'Maintenance / issue',
    description: 'Alert users about service disruptions',
    icon: 'alert',
    apply: (d) => ({
      ...d,
      style: 'warning',
      icon: 'alert',
      title: d.title || 'Service notice',
      description: d.description || 'We are experiencing an issue and working on a fix.',
      link_text: d.link_text || 'View status',
    }),
  },
  {
    key: 'promo',
    label: 'Promotion',
    description: 'Highlight special offers or discounts',
    icon: 'gift',
    apply: (d) => ({
      ...d,
      style: 'promo',
      icon: 'gift',
      title: d.title || 'Limited offer',
      description: d.description || "Don't miss it — limited time.",
      link_text: d.link_text || 'Claim',
    }),
  },
];

// ---------------------------------------------------------------------------
// BannersTab — list + create/edit orchestration
// ---------------------------------------------------------------------------

interface Props {
  clients: EmailHubClientOption[];
}

export function BannersTab({ clients }: Props) {
  const { data, error, isLoading, mutate } = useSWR<{ banners: Banner[] }>('/api/admin/banners');
  const banners = data?.banners ?? [];
  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);

  async function save(id: string | null, payload: Partial<Banner>) {
    const url = id ? `/api/admin/banners/${id}` : '/api/admin/banners';
    const method = id ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'Failed to save banner');
      return false;
    }
    toast.success(id ? 'Banner updated' : 'Banner created');
    setEditing(null);
    setCreating(false);
    void mutate();
    return true;
  }

  async function toggleActive(b: Banner) {
    const res = await fetch(`/api/admin/banners/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !b.active }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'Failed to update banner');
      return;
    }
    void mutate();
  }

  async function remove(id: string) {
    if (!confirm('Delete this banner? This cannot be undone.')) return;
    const res = await fetch(`/api/admin/banners/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'Failed to delete banner');
      return;
    }
    toast.success('Banner deleted');
    void mutate();
  }

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
      <header className="flex items-center justify-end gap-3 px-5 py-3 border-b border-nativz-border">
        <p className="mr-auto text-xs text-text-muted">
          Shown to Cortex users by agency, role, and time window.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90"
        >
          <Plus size={13} />
          Create banner
        </button>
      </header>

      {error ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-rose-500">Couldn&apos;t load banners.</p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="rounded-full border border-nativz-border bg-background px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            Retry
          </button>
        </div>
      ) : isLoading && banners.length === 0 ? (
        <SkeletonRows count={3} withAvatar={false} />
      ) : banners.length === 0 ? (
        <EmptyBanners onCreate={() => setCreating(true)} />
      ) : (
        <ul className="divide-y divide-nativz-border">
          {banners.map((b) => (
            <BannerRow
              key={b.id}
              banner={b}
              clientName={
                clients.find((c) => c.id === b.target_client_id)?.name ?? null
              }
              onEdit={() => setEditing(b)}
              onToggle={() => toggleActive(b)}
              onDelete={() => remove(b.id)}
            />
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <BannerEditor
          banner={editing}
          clients={clients}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={(payload) => save(editing?.id ?? null, payload)}
        />
      )}
    </section>
  );
}

function EmptyBanners({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-surface border border-nativz-border">
        <Megaphone size={22} className="text-accent-text" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-text-primary">No banners yet</h3>
        <p className="mt-1 max-w-md text-sm text-text-muted">
          Create a banner to announce a webinar, push a product update, warn about an outage,
          or promote something across Cortex.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
      >
        <Plus size={14} />
        Create banner
      </button>
    </div>
  );
}

function BannerRow({
  banner,
  clientName,
  onEdit,
  onToggle,
  onDelete,
}: {
  banner: Banner;
  clientName: string | null;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const status = useMemo(() => computeStatus(banner), [banner]);
  const targetParts: string[] = [];
  if (banner.target_agency) targetParts.push(banner.target_agency);
  if (banner.target_role) targetParts.push(banner.target_role);
  if (clientName) targetParts.push(clientName);
  if (targetParts.length === 0) targetParts.push('All users');

  const draft = useMemo(() => bannerToDraft(banner), [banner]);
  return (
    <li className="px-5 py-4 flex flex-col gap-3 md:grid md:grid-cols-[minmax(240px,2fr)_minmax(140px,1fr)_56px_140px_minmax(120px,auto)] md:items-center md:gap-4">
      <BannerPreview draft={draft} compact />

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-muted md:contents">
        <span className="md:hidden text-[10px] uppercase tracking-wider">Audience</span>
        <div className="md:min-w-0 truncate">{targetParts.join(' · ')}</div>

        <span className="md:hidden text-[10px] uppercase tracking-wider">Priority</span>
        <div className="tabular-nums md:text-center">{banner.priority}</div>

        <span className="md:hidden text-[10px] uppercase tracking-wider">Window</span>
        <div className="tabular-nums col-span-2 md:col-span-1">{fmtRange(banner.start_at, banner.end_at)}</div>
      </div>

      <div className="flex items-center gap-2 justify-end flex-wrap">
        <StatusPill status={status} />
        <button
          type="button"
          onClick={onToggle}
          role="switch"
          aria-checked={banner.active}
          aria-label={`${banner.active ? 'Pause' : 'Activate'} banner: ${banner.title}`}
          className={`h-6 w-10 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
            banner.active
              ? 'bg-emerald-500/20 border-emerald-500/40'
              : 'bg-surface border-nativz-border'
          } relative`}
          title={banner.active ? 'Active — click to pause' : 'Paused — click to activate'}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              banner.active ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit banner: ${banner.title}`}
          className="rounded-md p-2 text-text-muted hover:bg-surface-hover/40 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          title="Edit"
        >
          <Pencil size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete banner: ${banner.title}`}
          className="rounded-md p-2 text-text-muted hover:bg-rose-500/10 hover:text-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
          title="Delete"
        >
          <Trash2 size={14} aria-hidden />
        </button>
      </div>
    </li>
  );
}

type Status = 'live' | 'scheduled' | 'expired' | 'paused';

function computeStatus(b: Banner): Status {
  if (!b.active) return 'paused';
  const now = Date.now();
  const start = new Date(b.start_at).getTime();
  const end = b.end_at ? new Date(b.end_at).getTime() : null;
  if (start > now) return 'scheduled';
  if (end !== null && end < now) return 'expired';
  return 'live';
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${TONE_PILL[bannerStatusTone(status)]}`}
    >
      {status}
    </span>
  );
}

function fmtRange(start: string, end: string | null) {
  const s = new Date(start);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!end) return `${fmt(s)} → no expiry`;
  return `${fmt(s)} → ${fmt(new Date(end))}`;
}

// ---------------------------------------------------------------------------
// Editor modal — live preview at top, then template cards (create only),
// then the form.
// ---------------------------------------------------------------------------

function BannerEditor({
  banner,
  clients,
  onClose,
  onSave,
}: {
  banner: Banner | null;
  clients: EmailHubClientOption[];
  onClose: () => void;
  onSave: (payload: Partial<Banner>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Draft>(banner ? bannerToDraft(banner) : EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function submit() {
    if (!draft.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setBusy(true);
    try {
      const payload = draftToPayload(draft);
      const ok = await onSave(payload);
      if (!ok) return;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={banner ? 'Edit banner' : 'Create banner'}
      maxWidth="2xl"
    >
      <div className="space-y-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
            Preview
          </p>
          <BannerPreview draft={draft} />
        </div>

        {!banner && <TemplateGrid onApply={(t) => setDraft((d) => t.apply(d))} />}

        <div className="space-y-3">
          <LabeledInput
            label="Title *"
            value={draft.title}
            onChange={(v) => patch({ title: v })}
            placeholder="Webinar: Master AI SEO"
            autoFocus
          />
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Description
            </span>
            <textarea
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
              placeholder="Join us for an exclusive webinar…"
              className="w-full rounded-xl border border-nativz-border bg-background p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Style"
              value={draft.style}
              onChange={(v) => patch({ style: v as Style })}
              options={STYLE_LABELS}
            />
            <SelectField
              label="Icon"
              value={draft.icon}
              onChange={(v) => patch({ icon: v as Icon })}
              options={ICON_LABELS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="Link URL"
              value={draft.link_url}
              onChange={(v) => patch({ link_url: v })}
              placeholder="https://…"
            />
            <LabeledInput
              label="Link text"
              value={draft.link_text}
              onChange={(v) => patch({ link_text: v })}
              placeholder="Learn more"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DateTimeField
              label="Start date"
              helper="when to show (local)"
              value={draft.start_at}
              onChange={(v) => patch({ start_at: v })}
            />
            <DateTimeField
              label="End date"
              helper="auto-expire (local)"
              value={draft.end_at}
              onChange={(v) => patch({ end_at: v })}
            />
            <DateTimeField
              label="Event date"
              helper="displayed (local)"
              value={draft.event_at}
              onChange={(v) => patch({ event_at: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Position"
              value={draft.position}
              onChange={(v) => patch({ position: v as Position })}
              options={[
                { value: 'top', label: 'Top of page' },
                { value: 'sidebar', label: 'Sidebar' },
                { value: 'modal', label: 'Modal' },
              ]}
            />
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                Priority <span className="text-text-muted normal-case font-normal">(higher = shown first)</span>
              </span>
              <input
                type="number"
                value={draft.priority}
                onChange={(e) => patch({ priority: Number(e.target.value) || 0 })}
                className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </label>
          </div>

          <div>
            <p className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
              Target agency <span className="text-text-muted normal-case font-normal">(empty = both)</span>
            </p>
            <ChipGroup
              value={draft.target_agency}
              onChange={(v) => patch({ target_agency: v as Agency | '' })}
              options={[
                { value: '', label: 'Both' },
                { value: 'nativz', label: 'Nativz' },
                { value: 'anderson', label: 'Anderson' },
              ]}
            />
          </div>

          <div>
            <p className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
              Target role <span className="text-text-muted normal-case font-normal">(empty = both)</span>
            </p>
            <ChipGroup
              value={draft.target_role}
              onChange={(v) => patch({ target_role: v as Role | '' })}
              options={[
                { value: '', label: 'Both' },
                { value: 'admin', label: 'Admins' },
                { value: 'viewer', label: 'Portal users' },
              ]}
            />
          </div>

          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Target client <span className="text-text-muted normal-case font-normal">(optional — only shown to users with access to this client)</span>
            </span>
            <select
              value={draft.target_client_id}
              onChange={(e) => patch({ target_client_id: e.target.value })}
              className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">Any client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-5 pt-1">
            <CheckboxField
              label="Active"
              checked={draft.active}
              onChange={(v) => patch({ active: v })}
            />
            <CheckboxField
              label="Dismissible"
              checked={draft.dismissible}
              onChange={(v) => patch({ dismissible: v })}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-nativz-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-nativz-border bg-background px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !draft.title.trim()}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : banner ? 'Save changes' : 'Create banner'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Template picker — memoized so banner-editor keystrokes don't re-render the
// (entirely static) template card list.
// ---------------------------------------------------------------------------

const TemplateGrid = memo(function TemplateGrid({ onApply }: { onApply: (t: Template) => void }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
        Start from a template
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TEMPLATES.map((t) => {
          const TplIcon = ICON_COMPONENTS[t.icon];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onApply(t)}
              className="flex items-start gap-2.5 rounded-xl border border-nativz-border bg-background hover:bg-surface/60 px-3 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <TplIcon size={16} className="text-text-secondary mt-0.5" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{t.label}</p>
                <p className="text-xs text-text-muted truncate">{t.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Preview — exported shape that's also what the shell renderer will use.
// Memoized so list rows don't re-render every parent state change; the
// editor's live preview still updates on every keystroke (props change).
// ---------------------------------------------------------------------------

export const BannerPreview = memo(function BannerPreview({
  draft,
  compact = false,
}: {
  draft: Draft;
  compact?: boolean;
}) {
  const IconComponent = ICON_COMPONENTS[draft.icon] ?? Info;
  const styles = STYLE_CLASSES[draft.style] ?? STYLE_CLASSES.info;
  const title = draft.title.trim() || 'Banner title';

  return (
    <div
      className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${styles.container} ${
        compact ? 'truncate' : ''
      }`}
    >
      <IconComponent size={compact ? 14 : 16} className={`${styles.icon} shrink-0 mt-0.5`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${styles.title} ${compact ? 'text-xs truncate' : 'text-sm'}`}>
          {title}
        </p>
        {draft.description && !compact ? (
          <p className="text-xs text-text-secondary mt-0.5">{draft.description}</p>
        ) : null}
        {draft.link_url && draft.link_text && !compact ? (
          <a
            href={draft.link_url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1 text-xs mt-1 ${styles.link}`}
          >
            {draft.link_text}
            <ExternalLink size={11} aria-hidden />
          </a>
        ) : null}
      </div>
      {!draft.dismissible ? null : (
        <XCircle size={compact ? 12 : 14} className="text-text-muted shrink-0 mt-0.5 opacity-40" aria-hidden />
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Small form primitives
// ---------------------------------------------------------------------------

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateTimeField({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
        {label} {helper ? <span className="text-text-muted normal-case font-normal">· {helper}</span> : null}
      </span>
      <input
        type="datetime-local"
        value={toLocalInputValue(value)}
        onChange={(e) => onChange(fromLocalInputValue(e.target.value))}
        className="w-full rounded-xl border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
    </label>
  );
}

function ChipGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              active
                ? 'bg-accent text-white border-accent'
                : 'bg-background text-text-secondary border-nativz-border hover:text-text-primary'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-text-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-nativz-border accent-accent"
      />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Helpers: ISO ↔ datetime-local input value
// ---------------------------------------------------------------------------

function toLocalInputValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

// ---------------------------------------------------------------------------
// Banner ↔ Draft conversions
// ---------------------------------------------------------------------------

function bannerToDraft(b: Banner): Draft {
  return {
    title: b.title,
    description: b.description ?? '',
    style: b.style,
    icon: b.icon,
    link_url: b.link_url ?? '',
    link_text: b.link_text ?? '',
    start_at: b.start_at,
    end_at: b.end_at ?? '',
    event_at: b.event_at ?? '',
    position: b.position,
    priority: b.priority,
    target_agency: b.target_agency ?? '',
    target_role: b.target_role ?? '',
    target_client_id: b.target_client_id ?? '',
    active: b.active,
    dismissible: b.dismissible,
  };
}

function draftToPayload(d: Draft): Partial<Banner> {
  return {
    title: d.title.trim(),
    description: d.description.trim() || null,
    style: d.style,
    icon: d.icon,
    link_url: d.link_url.trim() || null,
    link_text: d.link_text.trim() || null,
    start_at: d.start_at || new Date().toISOString(),
    end_at: d.end_at || null,
    event_at: d.event_at || null,
    position: d.position,
    priority: d.priority,
    target_agency: d.target_agency || null,
    target_role: d.target_role || null,
    target_client_id: d.target_client_id || null,
    active: d.active,
    dismissible: d.dismissible,
  };
}
