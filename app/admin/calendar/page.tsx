import { CalendarDays, MapPin, User, Clock } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';

export default async function AdminCalendarPage() {
  try {
    const adminClient = createAdminClient();
    const now = new Date();

    // Get current month boundaries
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const { data: events } = await adminClient
      .from('shoot_events')
      .select('id, title, shoot_date, location, plan_status, client_id, clients(name, slug)')
      .gte('shoot_date', monthStart.toISOString())
      .lte('shoot_date', monthEnd.toISOString())
      .order('shoot_date');

    const shoots = (events ?? []).map((s) => ({
      ...s,
      clients: Array.isArray(s.clients) ? s.clients[0] ?? null : s.clients ?? null,
    })) as Array<{
      id: string;
      title: string;
      shoot_date: string;
      location: string | null;
      plan_status: string;
      client_id: string | null;
      clients: { name: string; slug: string } | null;
    }>;

    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Build a week-based calendar grid
    const daysInMonth = monthEnd.getDate();
    const firstDayOfWeek = monthStart.getDay(); // 0=Sun
    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = Array(firstDayOfWeek).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    // Map shoots to days
    const shootsByDay = new Map<number, typeof shoots>();
    for (const shoot of shoots) {
      const day = new Date(shoot.shoot_date).getDate();
      const existing = shootsByDay.get(day) || [];
      existing.push(shoot);
      shootsByDay.set(day, existing);
    }

    const today = now.getDate();
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Calendar</h1>
          <p className="text-sm text-text-muted mt-0.5">{monthName} — shoots, deadlines, and key dates</p>
        </div>

        {/* Calendar grid */}
        <Card className="overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-nativz-border">
            {weekDays.map((day) => (
              <div key={day} className="px-2 py-2 text-center text-[10px] font-medium text-text-muted uppercase tracking-wide">
                {day}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-nativz-border last:border-b-0">
              {week.map((day, di) => {
                const dayEvents = day ? shootsByDay.get(day) || [] : [];
                const isToday = day === today;
                const isPast = day !== null && day < today;

                return (
                  <div
                    key={di}
                    className={`
                      min-h-[80px] border-r border-nativz-border last:border-r-0 p-1.5
                      ${!day ? 'bg-surface-hover/30' : ''}
                      ${isPast ? 'opacity-50' : ''}
                    `}
                  >
                    {day && (
                      <>
                        <span className={`
                          inline-flex items-center justify-center text-xs font-medium w-6 h-6 rounded-full
                          ${isToday ? 'bg-accent text-white' : 'text-text-secondary'}
                        `}>
                          {day}
                        </span>
                        {dayEvents.map((event) => (
                          <div
                            key={event.id}
                            className={`
                              mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium truncate
                              ${event.plan_status === 'sent'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-accent/10 text-accent-text'}
                            `}
                            title={`${event.title}${event.clients ? ` — ${event.clients.name}` : ''}`}
                          >
                            {event.title}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </Card>

        {/* Events list for the month */}
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">
            Events this month
          </h2>
          {shoots.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={24} />}
              title="No events this month"
              description="Schedule shoots or sync your Google Calendar to see events here."
            />
          ) : (
            <div className="space-y-2">
              {shoots.map((shoot, i) => {
                const date = new Date(shoot.shoot_date);
                const statusColors: Record<string, string> = {
                  pending: 'text-text-muted',
                  sent: 'text-emerald-400',
                  generating: 'text-accent',
                };

                return (
                  <div
                    key={shoot.id}
                    className="animate-stagger-in flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <div className="flex flex-col items-center justify-center rounded-lg bg-accent/10 text-accent px-2.5 py-1.5 min-w-[48px]">
                      <span className="text-base font-bold leading-none">{date.getDate()}</span>
                      <span className="text-[9px] font-medium uppercase mt-0.5">
                        {date.toLocaleDateString('en-US', { month: 'short' })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{shoot.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {shoot.clients && (
                          <span className="text-xs text-text-muted flex items-center gap-1">
                            <User size={10} /> {shoot.clients.name}
                          </span>
                        )}
                        {shoot.location && (
                          <span className="text-xs text-text-muted flex items-center gap-1">
                            <MapPin size={10} /> {shoot.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant={shoot.plan_status === 'sent' ? 'success' : 'default'}>
                      {shoot.plan_status === 'sent' ? 'Plan ready' : 'No plan'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    );
  } catch (error) {
    console.error('AdminCalendarPage error:', error);
    return <PageError />;
  }
}
