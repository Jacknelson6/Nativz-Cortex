'use client';

import { Dialog } from '@/components/ui/dialog';
import { ContentWizard } from './content-wizard';

interface ContentWizardModalProps {
  open: boolean;
  onClose: () => void;
  clients: { id: string; name: string }[];
}

export function ContentWizardModal({ open, onClose, clients }: ContentWizardModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title=""
      maxWidth="2xl"
      className="!max-w-3xl"
      bodyClassName="p-6 pb-8 max-h-[90vh] overflow-y-auto"
    >
      <ContentWizard clients={clients} onIdeasSaved={onClose} />
    </Dialog>
  );
}
