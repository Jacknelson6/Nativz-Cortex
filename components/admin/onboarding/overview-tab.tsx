import { Activity, CheckCircle2, ClipboardList, LayoutTemplate, Mail, Timer } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionTile } from '@/components/admin/section-tabs';

async function loadStats() {
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
    const total = trackers.length;
    const inProgress = trackers.filter((t) => t.status === 'in_progress' || t.status === 'active').length;
    const notStarted = trackers.filter((t) => t.status === 'not_started' || t.status === 'pending').length;
    const completed = trackers.filter((t) => t.status === 'completed' || t.status === 'complete').length;

    return {
      totalTrackers: total,
      inProgress,
      notStarted,
      completed,
      templateCount: templatesRes.count ?? 0,
      emailTemplateCount: emailTemplatesRes.count ?? 0,
    };
  } catch (err) {
    console.error('[onboarding overview] loadStats failed (returning empty):', err);
    return {
      totalTrackers: 0,
      inProgress: 0,
      notStarted: 0,
      completed: 0,
      templateCount: 0,
      emailTemplateCount: 0,
    };
  }
}

export async function OnboardingOverviewTab() {
  const s = await loadStats();
  const base = '/admin/onboarding';

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Per-service onboarding state across every client. Click a tile to drill in.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SectionTile
          href={`${base}?tab=trackers`}
          icon={<ClipboardList size={18} />}
          title="Active trackers"
          status={s.totalTrackers > 0 ? 'ok' : 'soon'}
          primary={`${s.totalTrackers} total`}
          secondary={`${s.inProgress} in progress · ${s.completed} complete`}
        />
        <SectionTile
          href={`${base}?tab=trackers`}
          icon={<Timer size={18} />}
          title="In progress"
          status={s.inProgress > 0 ? 'ok' : 'soon'}
          primary={`${s.inProgress} tracker${s.inProgress === 1 ? '' : 's'}`}
          secondary="Live client setups"
        />
        <SectionTile
          href={`${base}?tab=trackers`}
          icon={<Activity size={18} />}
          title="Not started"
          status={s.notStarted > 0 ? 'warn' : 'ok'}
          primary={`${s.notStarted} tracker${s.notStarted === 1 ? '' : 's'}`}
          secondary="Pending kickoff"
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
    </div>
  );
}
