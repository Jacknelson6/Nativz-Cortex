'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScheduleShootModal } from '@/components/shoots/schedule-shoot-modal';

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

export function ShootScheduleButton({ shoot }: ShootScheduleButtonProps) {
  const [open, setOpen] = useState(false);

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
      <ScheduleShootModal
        open={open}
        onClose={() => setOpen(false)}
        shoot={{
          clientName: shoot.clientName ?? 'Unknown client',
          clientId: shoot.client_id,
          mondayItemId: shoot.mondayItemId,
          date: shoot.shoot_date,
          location: shoot.location ?? '',
          notes: '',
          pocEmails: shoot.pocEmails ?? [],
          agency: shoot.agency,
        }}
      />
    </>
  );
}
