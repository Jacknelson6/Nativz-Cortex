import { unstable_cache } from 'next/cache';
import { CheckCircle2, ClipboardList, LayoutTemplate, Mail, PauseCircle, Timer } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionTile } from '@/components/admin/section-tabs';
import { OnboardingActivityFeed } from '@/components/admin/onboarding/activity-feed';
import { ONBOARDING_CACHE_TAG, ONBOARDING_CACHE_TTL } from './cache';

const loadStats = unstable_cache(
  loadStatsUncached,
  ['onboarding-overview-stats'],
  { revalidate: ONBOARDING_CACHE_TTL, tags: [ONBOARDING_CACHE_TAG] },
);

async function loadStatsUncached() {
  try {
    const admin = createAdminClient();

    const [trackersRes, templatesRes, emailTemplatesRes] = await Promise.all([
      admin
        .from('onboarding_trackers')
        .select('id, status')
        .eq('is_template', false),
      admin
        .from('onboarding_trackers')
        .select('id', { count: 'exact', head: true })
        .eq('is_template', true),
      admin
        .from('onboarding_email_templates')
        .select('id', { count: 'exact', head: true }),
    ]);

    const trackers = trackersRes.data ?? [];
    // Tracker statuses are constrained to: active | paused | completed | archived
    // (see migration 136). Previously this filtered on phase-level statuses
    // which never matched, so "Not started" was always 0.
    const active = trackers.filter((t) => t.status === 'active').length;
    const paused = trackers.filter((t) => t.status === 'paused').length;
    const completed = trackers.filter((t) => t.status === 'completed').length;
    const archived = trackers.filter((t) => t.status === 'archived').length;

    return {
      totalTrackers: trackers.length - archived, // archived hidden from main count
      active,
      paused,
      completed,
      archived,
      templateCount: templatesRes.count ?? 0,
      emailTemplateCount: emailTemplatesRes.count ?? 0,
    };
  } catch (err) {
    console.error('[onboarding overview] loadStats failed (returning empty):', err);
    return {
      totalTrackers: 0,
      active: 0,
      paused: 0,
      completed: 0,
      archived: 0,
      templateCount: 0,
      emailTemplateCount: 0,
    };
  }
}

export async function OnboardingOverviewTab() {
  const s = await loadStats();
  const base = '/admin/onboarding';

  return (
    <div className="space-y-8">
      <p className="text-sm text-text-muted">
        Per-service onboarding state across every client. Click a tile to drill in.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SectionTile
          href={`${base}?tab=trackers`}
          icon={<ClipboardList size={18} />}
          title="Trackers in play"
          status={s.totalTrackers > 0 ? 'ok' : 'soon'}
          primary={`${s.totalTrackers} total`}
          secondary={`${s.active} active · ${s.paused} paused · ${s.completed} complete`}
        />
        <SectionTile
          href={`${base}?tab=trackers`}
          icon={<Timer size={18} />}
          title="Active"
          status={s.active > 0 ? 'ok' : 'soon'}
          primary={`${s.active} tracker${s.active === 1 ? '' : 's'}`}
          secondary="Live client onboardings"
        />
        <SectionTile
          href={`${base}?tab=trackers`}
          icon={<PauseCircle size={18} />}
          title="Paused"
          status={s.paused > 0 ? 'warn' : 'ok'}
          primary={`${s.paused} tracker${s.paused === 1 ? '' : 's'}`}
          secondary="Temporarily on hold"
        />
        <SectionTile
          href={`${base}?tab=trackers`}
          icon={<CheckCircle2 size={18} />}
          title="Completed"
          primary={`${s.completed} tracker${s.completed === 1 ? '' : 's'}`}
          secondary="Finished onboarding cycles"
        />
        <SectionTile
          href={`${base}?tab=templates`}
          icon={<LayoutTemplate size={18} />}
          title="Service templates"
          primary={`${s.templateCount} template${s.templateCount === 1 ? '' : 's'}`}
          secondary="Reusable presets per service"
        />
        <SectionTile
          href={`${base}?tab=email-templates`}
          icon={<Mail size={18} />}
          title="Email templates"
          primary={`${s.emailTemplateCount} template${s.emailTemplateCount === 1 ? '' : 's'}`}
          secondary="Onboarding email composer"
        />
      </div>

      <OnboardingActivityFeed />
    </div>
  );
}
