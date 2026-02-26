'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScheduleShootsModal } from '@/components/shoots/schedule-shoot-modal';

interface ShootData {
  id: string;
  title: string;
  shoot_date: string;
  location: string | null;
  plan_status: string;
  client_id: string | null;
  clientName: string | null;
  clientSlug: string | null;
  agency?: string;
  pocEmails?: string[];
  mondayItemId?: string;
}

interface ShootScheduleButtonProps {
  shoot: ShootData;
}

/** Convert an ISO date string to YYYY-MM-DD for HTML date inputs */
function toDateInputValue(iso: string): string {
  if (!iso) return '';
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  // ISO timestamp — take the date part
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function ShootScheduleButton({ shoot }: ShootScheduleButtonProps) {
  const [open, setOpen] = useState(false);

  // Use client name if available, otherwise fall back to shoot title
  const clientName = shoot.clientName || shoot.title || 'Unknown client';

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Calendar size={14} />
        Send invite
      </Button>
      <ScheduleShootsModal
        open={open}
        onClose={() => setOpen(false)}
        initialClientId={shoot.client_id}
      />
    </>
  );
}
