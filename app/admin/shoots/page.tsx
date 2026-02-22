'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';
import { StatCard } from '@/components/shared/stat-card';
import { ShootEventsList } from '@/components/calendar/shoot-events-list';
import { ConnectCalendar } from '@/components/calendar/connect-calendar';
import { ScheduleShootDialog } from '@/components/shoots/schedule-shoot-dialog';
import { createClient } from '@/lib/supabase/client';

export default function AdminShootsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState({ upcoming: 0, plansReady: 0, needsAttention: 0 });

  const fetchStats = useCallback(async () => {
    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const sevenDays = new Date();
      sevenDays.setDate(sevenDays.getDate() + 7);

      const [upcomingRes, readyRes, urgentRes] = await Promise.all([
        supabase
          .from('shoot_events')
          .select('id', { count: 'exact', head: true })
          .gte('shoot_date', now),
        supabase
          .from('shoot_events')
          .select('id', { count: 'exact', head: true })
          .gte('shoot_date', now)
          .eq('plan_status', 'sent'),
        supabase
          .from('shoot_events')
          .select('id', { count: 'exact', head: true })
          .gte('shoot_date', now)
          .lte('shoot_date', sevenDays.toISOString())
          .neq('plan_status', 'sent'),
      ]);

      setStats({
        upcoming: upcomingRes.count ?? 0,
        plansReady: readyRes.count ?? 0,
        needsAttention: urgentRes.count ?? 0,
      });
    } catch {
      // Stats are non-critical
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [refreshKey, fetchStats]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Shoots</h1>
          <p className="text-sm text-text-muted mt-0.5">Manage upcoming shoot events and content plans</p>
        </div>
        <GlassButton onClick={() => setDialogOpen(true)}>
          <Calendar size={14} />
          Schedule shoot
        </GlassButton>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          title="Upcoming shoots"
          value={String(stats.upcoming)}
          icon={<Calendar size={20} />}
        />
        <StatCard
          title="Plans ready"
          value={String(stats.plansReady)}
          icon={<CheckCircle2 size={20} />}
        />
        <StatCard
          title="Needs attention"
          value={String(stats.needsAttention)}
          subtitle="Within 7 days, no plan"
          icon={<AlertTriangle size={20} />}
        />
      </div>

      {/* Calendar connection */}
      <ConnectCalendar />

      {/* Events list */}
      <ShootEventsList key={refreshKey} />

      {/* Schedule dialog */}
      <ScheduleShootDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
