'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectCalendar } from '@/components/calendar/connect-calendar';
import { ShootEventsList } from '@/components/calendar/shoot-events-list';

export default function CalendarSettingsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={14} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Calendar & shoots</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Connect your calendar to auto-detect shoots and generate content plans
          </p>
        </div>
      </div>

      {/* Calendar connection */}
      <ConnectCalendar />

      {/* Upcoming shoots */}
      <ShootEventsList />
    </div>
  );
}
