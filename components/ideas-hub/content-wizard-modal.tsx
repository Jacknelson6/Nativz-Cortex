'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { ContentWizard } from './content-wizard';

interface ContentWizardModalProps {
  open: boolean;
  onClose: () => void;
  clients: { id: string; name: string }[];
}

export function ContentWizardModal({ open, onClose, clients }: ContentWizardModalProps) {
  // Close on escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl mx-4 rounded-2xl border border-nativz-border bg-background shadow-elevated animate-modal-pop-in max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Content */}
        <div className="p-6 pb-8">
          <ContentWizard
            clients={clients}
            onIdeasSaved={onClose}
          />
        </div>
      </div>
    </div>
  );
}
