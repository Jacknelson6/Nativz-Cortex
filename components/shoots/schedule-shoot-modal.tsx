'use client';

import { useState } from 'react';
import { Loader2, ChevronRight, ChevronLeft, Calendar, Mail, Users, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Agency presets
// ---------------------------------------------------------------------------

const AGENCY_PRESETS: Record<string, string[]> = {
  'Nativz': ['jack@nativz.io', 'jake@nativz.io', 'cole@nativz.io'],
  'Anderson Collaborative': ['jack@andersoncollaborative.com', 'jake@andersoncollaborative.com', 'trevor@andersoncollaborative.com'],
};

const VIDEOGRAPHERS = ['jamie@nativz.io', 'jake@nativz.io', 'alyssa@nativz.io'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShootData {
  clientName: string;
  clientId: string | null;
  mondayItemId?: string;
  date: string | null;
  location: string;
  notes: string;
  pocEmails?: string[];
}

interface ScheduleShootModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  shoot?: ShootData;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleShootModal({ open, onClose, onCreated, shoot }: ScheduleShootModalProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Shoot details
  const [clientName] = useState(shoot?.clientName ?? '');
  const [shootDate, setShootDate] = useState(shoot?.date ?? '');
  const [shootTime, setShootTime] = useState('09:00');
  const [location, setLocation] = useState(shoot?.location ?? '');
  const [notes, setNotes] = useState(shoot?.notes ?? '');

  // Step 2: Team & invites
  const [agency, setAgency] = useState<string>('Nativz');
  const [clientEmails, setClientEmails] = useState<string[]>(shoot?.pocEmails ?? []);
  const [newClientEmail, setNewClientEmail] = useState('');
  const [additionalEmails, setAdditionalEmails] = useState<string[]>([]);
  const [newAdditionalEmail, setNewAdditionalEmail] = useState('');

  // Step 3: Confirm
  const [addToCalendar, setAddToCalendar] = useState(true);
  const [sendInvites, setSendInvites] = useState(true);

  const teamEmails = AGENCY_PRESETS[agency] ?? [];
  const allInvitees = [...new Set([...teamEmails, ...clientEmails, ...additionalEmails, ...VIDEOGRAPHERS])];

  function reset() {
    setStep(1);
    setShootDate(shoot?.date ?? '');
    setShootTime('09:00');
    setLocation(shoot?.location ?? '');
    setNotes(shoot?.notes ?? '');
    setAgency('Nativz');
    setClientEmails(shoot?.pocEmails ?? []);
    setNewClientEmail('');
    setAdditionalEmails([]);
    setNewAdditionalEmail('');
    setAddToCalendar(true);
    setSendInvites(true);
  }

  function addEmail(type: 'client' | 'additional') {
    const email = type === 'client' ? newClientEmail.trim() : newAdditionalEmail.trim();
    if (!email || !/\S+@\S+\.\S+/.test(email)) return;

    if (type === 'client') {
      if (!clientEmails.includes(email)) setClientEmails([...clientEmails, email]);
      setNewClientEmail('');
    } else {
      if (!additionalEmails.includes(email)) setAdditionalEmails([...additionalEmails, email]);
      setNewAdditionalEmail('');
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/shoots/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName,
          client_id: shoot?.clientId ?? null,
          monday_item_id: shoot?.mondayItemId,
          shoot_date: shootDate,
          shoot_time: shootTime,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
          agency,
          team_emails: teamEmails,
          client_emails: clientEmails,
          additional_emails: additionalEmails,
          videographer_emails: VIDEOGRAPHERS,
          add_to_calendar: addToCalendar,
          send_invites: sendInvites,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to schedule shoot.');
        return;
      }

      const data = await res.json();
      toast.success(
        `Shoot scheduled${data.googleEventCreated ? ' and calendar event created' : ''}. ${data.inviteeCount} invitees.`,
      );
      reset();
      onClose();
      onCreated?.();
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} title="Schedule shoot" maxWidth="lg">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              s === step ? 'bg-accent text-white' : s < step ? 'bg-accent/20 text-accent-text' : 'bg-surface-hover text-text-muted'
            }`}>
              {s < step ? <Check size={14} /> : s}
            </div>
            <span className={`text-xs ${s === step ? 'text-text-primary' : 'text-text-muted'}`}>
              {s === 1 ? 'Details' : s === 2 ? 'Team' : 'Confirm'}
            </span>
            {s < 3 && <ChevronRight size={14} className="text-text-muted" />}
          </div>
        ))}
      </div>

      {/* Step 1: Confirm shoot details */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">Client</label>
            <div className="rounded-lg border border-nativz-border bg-surface-hover/50 px-3 py-2 text-sm text-text-primary">
              {clientName || 'Unknown client'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="shoot-date"
              label="Shoot date"
              type="date"
              value={shootDate}
              onChange={(e) => setShootDate(e.target.value)}
              required
            />
            <Input
              id="shoot-time"
              label="Start time"
              type="time"
              value={shootTime}
              onChange={(e) => setShootTime(e.target.value)}
            />
          </div>

          <Input
            id="shoot-location"
            label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Studio, on-location address, etc."
          />

          <Textarea
            id="shoot-notes"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Special instructions, equipment needs, etc."
            rows={3}
          />

          <div className="flex justify-end pt-2">
            <GlassButton onClick={() => setStep(2)} disabled={!shootDate}>
              Next
              <ChevronRight size={14} />
            </GlassButton>
          </div>
        </div>
      )}

      {/* Step 2: Calendar invite & team */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Agency selector */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Agency</label>
            <div className="flex gap-2">
              {Object.keys(AGENCY_PRESETS).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAgency(a)}
                  className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    agency === a
                      ? 'border-accent/40 bg-accent-surface text-accent-text'
                      : 'border-nativz-border bg-surface text-text-muted hover:text-text-secondary hover:border-text-muted'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {teamEmails.map((email) => (
                <Badge key={email}>{email}</Badge>
              ))}
            </div>
          </div>

          {/* Videographers (read-only) */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Videographers</label>
            <div className="flex flex-wrap gap-1.5">
              {VIDEOGRAPHERS.map((email) => (
                <Badge key={email} variant="info">{email}</Badge>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-1">Always included</p>
          </div>

          {/* Client contacts */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Client contacts</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {clientEmails.map((email) => (
                <span key={email} className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2.5 py-1 text-xs text-text-secondary">
                  {email}
                  <button
                    type="button"
                    onClick={() => setClientEmails(clientEmails.filter((e) => e !== email))}
                    className="cursor-pointer text-text-muted hover:text-red-400"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail('client'))}
                placeholder="client@email.com"
                className="flex-1 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => addEmail('client')}>Add</Button>
            </div>
          </div>

          {/* Additional invitees */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Additional invitees</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {additionalEmails.map((email) => (
                <span key={email} className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2.5 py-1 text-xs text-text-secondary">
                  {email}
                  <button
                    type="button"
                    onClick={() => setAdditionalEmails(additionalEmails.filter((e) => e !== email))}
                    className="cursor-pointer text-text-muted hover:text-red-400"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                value={newAdditionalEmail}
                onChange={(e) => setNewAdditionalEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail('additional'))}
                placeholder="anyone@email.com"
                className="flex-1 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => addEmail('additional')}>Add</Button>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              <ChevronLeft size={14} />
              Back
            </Button>
            <GlassButton onClick={() => setStep(3)}>
              Next
              <ChevronRight size={14} />
            </GlassButton>
          </div>
        </div>
      )}

      {/* Step 3: Confirm & send */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Client</span>
              <span className="text-text-primary font-medium">{clientName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Date</span>
              <span className="text-text-primary">
                {shootDate ? new Date(shootDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                }) : '—'}{' '}
                at {shootTime || '9:00 AM'}
              </span>
            </div>
            {location && (
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Location</span>
                <span className="text-text-primary">{location}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Agency</span>
              <span className="text-text-primary">{agency}</span>
            </div>
          </div>

          {/* Invitee summary */}
          <div>
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              All invitees ({allInvitees.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {allInvitees.map((email) => (
                <Badge key={email}>{email}</Badge>
              ))}
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={addToCalendar}
                onChange={(e) => setAddToCalendar(e.target.checked)}
                className="rounded border-nativz-border"
              />
              <span className="text-sm text-text-secondary flex items-center gap-1.5">
                <Calendar size={14} className="text-text-muted" />
                Add to Google Calendar
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendInvites}
                onChange={(e) => setSendInvites(e.target.checked)}
                className="rounded border-nativz-border"
              />
              <span className="text-sm text-text-secondary flex items-center gap-1.5">
                <Mail size={14} className="text-text-muted" />
                Send email invites to all attendees
              </span>
            </label>
          </div>

          <div className="flex justify-between pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep(2)}>
              <ChevronLeft size={14} />
              Back
            </Button>
            <GlassButton onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Users size={14} />
                  Create shoot & send invites
                </>
              )}
            </GlassButton>
          </div>
        </div>
      )}
    </Dialog>
  );
}
