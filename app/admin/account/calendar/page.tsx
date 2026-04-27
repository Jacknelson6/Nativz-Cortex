'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectCalendar } from '@/components/calendar/connect-calendar';

export default function CalendarSettingsPage() {
  return (
    <div className="cortex-page-gutter max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/account">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={14} />
          </Button>
        </Link>
        <div>
          <h1 className="ui-page-title">Calendar</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Connect a Google account so the team-availability grid and scheduling picker can read your free/busy.
          </p>
        </div>
      </div>

      <ConnectCalendar />
    </div>
  );
}
