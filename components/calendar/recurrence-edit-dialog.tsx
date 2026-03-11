'use client';

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RecurrenceEditDialogProps {
  title: string;
  onChoice: (scope: 'this' | 'all') => void;
  onClose: () => void;
}

/**
 * Dialog shown when editing a recurring meeting occurrence.
 * Asks whether to edit just this occurrence or all future events.
 */
export function RecurrenceEditDialog({ title, onChoice, onClose }: RecurrenceEditDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="w-[360px] rounded-xl border border-nativz-border bg-surface shadow-elevated p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Edit recurring meeting</h3>
          <button onClick={onClose} className="rounded-md p-1 text-text-muted hover:bg-surface-hover transition-colors">
            <X size={14} />
          </button>
        </div>

        <p className="text-sm text-text-secondary mb-1">{title}</p>
        <p className="text-xs text-text-muted mb-5">
          This meeting is part of a recurring series. How would you like to edit it?
        </p>

        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={() => onChoice('this')}
          >
            This event only
          </Button>
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={() => onChoice('all')}
          >
            All future events
          </Button>
        </div>

        <div className="flex justify-end mt-4 pt-3 border-t border-nativz-border">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
