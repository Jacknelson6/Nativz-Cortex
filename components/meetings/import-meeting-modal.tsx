'use client';

import { useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Client {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

interface ImportMeetingModalProps {
  clients: Client[];
  onClose: () => void;
  onImported: (note: { id: string; client_id: string; title: string; content: string; metadata: Record<string, unknown> | null; source: string; created_at: string; updated_at: string }) => void;
}

export function ImportMeetingModal({ clients, onClose, onImported }: ImportMeetingModalProps) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [transcript, setTranscript] = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendees, setAttendees] = useState('');
  const [importing, setImporting] = useState(false);

  async function handleImport() {
    if (!clientId || !transcript.trim()) {
      toast.error('Select a client and paste transcript');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge/import-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript.trim(),
          meetingDate: meetingDate || undefined,
          attendees: attendees
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
          source: 'fyxer',
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? 'Import failed');
        setImporting(false);
        return;
      }

      const { entry } = await res.json();
      toast.success('Meeting notes imported');
      onImported(entry);
    } catch {
      toast.error('Import failed');
      setImporting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div className="w-full max-w-2xl pointer-events-auto animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-surface border border-nativz-border rounded-2xl shadow-elevated max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-nativz-border sticky top-0 bg-surface z-10">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Import meeting notes</h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Paste a transcript from Fyxer.ai — AI will extract key takeaways
                </p>
              </div>
              <button
                onClick={onClose}
                className="cursor-pointer p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Client selector */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Client
                </label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Meeting date
                </label>
                <input
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
              </div>

              {/* Attendees */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Attendees <span className="text-text-muted font-normal">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={attendees}
                  onChange={(e) => setAttendees(e.target.value)}
                  placeholder="Jack Nelson, John Smith, Jane Doe"
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
              </div>

              {/* Transcript */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Meeting transcript
                </label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste the full transcript from Fyxer.ai here..."
                  rows={12}
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none font-mono leading-relaxed"
                />
                <p className="text-[10px] text-text-muted mt-1">
                  {transcript.length > 0
                    ? `${transcript.split(/\s+/).filter(Boolean).length} words`
                    : 'AI will extract summary, attendees, decisions, and action items'}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-nativz-border sticky bottom-0 bg-surface">
              <Button variant="outline" onClick={onClose} disabled={importing}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={importing || !transcript.trim()}>
                {importing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Import notes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
