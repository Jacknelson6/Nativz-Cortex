'use client';

import { useState, useEffect } from 'react';
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Mail,
  Users,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Team roster per agency
// ---------------------------------------------------------------------------

interface TeamMember {
  name: string;
  email: string;
}

const NATIVZ_TEAM: TeamMember[] = [
  { name: 'Jack', email: 'jack@nativz.io' },
  { name: 'Jake', email: 'jake@nativz.io' },
  { name: 'Jaime', email: 'jaime@nativz.io' },
  { name: 'Cole', email: 'cole@nativz.io' },
];

const AC_TEAM: TeamMember[] = [
  { name: 'Jack', email: 'jack@andersoncollaborative.com' },
  { name: 'Jaime', email: 'jaime@andersoncollaborative.com' },
  { name: 'Cole', email: 'cole@andersoncollaborative.com' },
  { name: 'Trevor', email: 'trevor@andersoncollaborative.com' },
];

const AGENCY_TEAMS: Record<string, TeamMember[]> = {
  Nativz: NATIVZ_TEAM,
  'Anderson Collaborative': AC_TEAM,
};

// Cole is excluded from correspondence/scheduling for these clients
const COLE_EXCLUDED_CLIENTS = ['ctc owings auto', 'equidad homes'];

function isColeExcluded(clientName: string): boolean {
  const lower = clientName.toLowerCase();
  return COLE_EXCLUDED_CLIENTS.some((c) => lower.includes(c));
}

function isColeEmail(email: string): boolean {
  return email.toLowerCase().startsWith('cole@');
}

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
  agency?: string;
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
  const [clientName, setClientName] = useState(shoot?.clientName ?? '');
  const [shootDate, setShootDate] = useState(shoot?.date ?? '');
  const [shootTime, setShootTime] = useState('09:00');
  const [location, setLocation] = useState(shoot?.location ?? '');
  const [notes, setNotes] = useState(shoot?.notes ?? '');

  // Step 2: Team & invites
  const [agency, setAgency] = useState<string>(() => {
    const sa = shoot?.agency?.toLowerCase() ?? '';
    if (sa.includes('anderson')) return 'Anderson Collaborative';
    return 'Nativz';
  });
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [clientEmails, setClientEmails] = useState<string[]>(shoot?.pocEmails ?? []);
  const [newClientEmail, setNewClientEmail] = useState('');
  const [additionalEmails, setAdditionalEmails] = useState<string[]>([]);
  const [newAdditionalEmail, setNewAdditionalEmail] = useState('');
  const [coleWarning, setColeWarning] = useState(false);

  // Step 3: Confirm
  const [addToCalendar, setAddToCalendar] = useState(true);
  const [sendInvites, setSendInvites] = useState(true);

  const team = AGENCY_TEAMS[agency] ?? NATIVZ_TEAM;
  const clientColeExcluded = isColeExcluded(clientName);

  const selectedTeamEmails = team
    .filter((m) => selectedEmails.has(m.email))
    .map((m) => m.email);

  const allInvitees = [
    ...new Set([...selectedTeamEmails, ...clientEmails, ...additionalEmails]),
  ];

  // Initialize selected team (all selected by default, except Cole for excluded clients)
  function initTeamSelection(agencyName: string, client: string) {
    const t = AGENCY_TEAMS[agencyName] ?? NATIVZ_TEAM;
    const excluded = isColeExcluded(client);
    const initial = new Set<string>();
    for (const m of t) {
      if (excluded && isColeEmail(m.email)) continue;
      initial.add(m.email);
    }
    setSelectedEmails(initial);
  }

  // Sync state when shoot prop changes
  useEffect(() => {
    if (open) {
      setStep(1);
      setClientName(shoot?.clientName ?? '');
      setShootDate(shoot?.date ?? '');
      setShootTime('09:00');
      setLocation(shoot?.location ?? '');
      setNotes(shoot?.notes ?? '');
      setClientEmails(shoot?.pocEmails ?? []);
      setNewClientEmail('');
      setAdditionalEmails([]);
      setNewAdditionalEmail('');
      setColeWarning(false);
      setAddToCalendar(true);
      setSendInvites(true);

      const detectedAgency = (() => {
        const sa = shoot?.agency?.toLowerCase() ?? '';
        if (sa.includes('anderson')) return 'Anderson Collaborative';
        return 'Nativz';
      })();
      setAgency(detectedAgency);
      initTeamSelection(detectedAgency, shoot?.clientName ?? '');
    }
  }, [open, shoot?.clientName, shoot?.date, shoot?.location, shoot?.notes, shoot?.pocEmails, shoot?.agency]);

  function handleAgencyChange(newAgency: string) {
    setAgency(newAgency);
    initTeamSelection(newAgency, clientName);
  }

  function toggleMember(email: string) {
    // Cole restriction check
    if (isColeEmail(email) && clientColeExcluded) {
      setColeWarning(true);
      return;
    }

    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
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
          team_emails: selectedTeamEmails,
          client_emails: clientEmails,
          additional_emails: additionalEmails,
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
      onClose();
      onCreated?.();
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Schedule shoot" maxWidth="lg">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                s === step
                  ? 'bg-accent text-white'
                  : s < step
                    ? 'bg-accent/20 text-accent-text'
                    : 'bg-surface-hover text-text-muted'
              }`}
            >
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

      {/* Step 2: Team selection */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Agency selector */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Agency</label>
            <div className="flex gap-2">
              {Object.keys(AGENCY_TEAMS).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => handleAgencyChange(a)}
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
          </div>

          {/* Team members — toggleable pills */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Team members</label>
            <div className="flex flex-wrap gap-2">
              {team.map((member) => {
                const isSelected = selectedEmails.has(member.email);
                const isCole = isColeEmail(member.email);
                const isExcluded = isCole && clientColeExcluded;

                return (
                  <button
                    key={member.email}
                    type="button"
                    onClick={() => toggleMember(member.email)}
                    className={`
                      cursor-pointer relative flex items-center gap-2 rounded-xl border px-4 py-2.5
                      text-sm font-medium transition-all duration-200
                      ${
                        isExcluded
                          ? 'border-red-500/20 bg-red-500/[0.04] text-red-400/50 cursor-not-allowed'
                          : isSelected
                            ? 'border-accent/40 bg-accent/15 text-accent-text shadow-[0_0_12px_rgba(4,107,210,0.15)]'
                            : 'border-nativz-border bg-surface text-text-muted hover:border-text-muted hover:text-text-secondary'
                      }
                    `}
                  >
                    {/* Selection indicator */}
                    <span
                      className={`
                        flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200
                        ${
                          isExcluded
                            ? 'bg-red-500/15 text-red-400'
                            : isSelected
                              ? 'bg-accent text-white scale-100'
                              : 'bg-white/[0.06] text-transparent scale-90'
                        }
                      `}
                    >
                      {isExcluded ? <X size={10} /> : <Check size={10} />}
                    </span>

                    <div className="text-left">
                      <p className={`text-sm font-medium leading-none ${isExcluded ? 'line-through' : ''}`}>
                        {member.name}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-accent-text/60' : 'text-text-muted'}`}>
                        {member.email.split('@')[0]}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-text-muted mt-1.5">
              {selectedTeamEmails.length} of {team.length} selected
            </p>
          </div>

          {/* Cole warning banner */}
          {coleWarning && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-4 py-3 animate-fade-in">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">Cole cannot be added to this shoot</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Cole is excluded from all correspondence and scheduling for {clientName}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setColeWarning(false)}
                className="cursor-pointer text-text-muted hover:text-text-secondary shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Client contacts */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Client contacts</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {clientEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2.5 py-1 text-xs text-text-secondary"
                >
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
              <Button type="button" size="sm" variant="ghost" onClick={() => addEmail('client')}>
                Add
              </Button>
            </div>
          </div>

          {/* Additional invitees */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Additional invitees</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {additionalEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2.5 py-1 text-xs text-text-secondary"
                >
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
              <Button type="button" size="sm" variant="ghost" onClick={() => addEmail('additional')}>
                Add
              </Button>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              <ChevronLeft size={14} />
              Back
            </Button>
            <GlassButton onClick={() => setStep(3)} disabled={selectedTeamEmails.length === 0}>
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
                {shootDate
                  ? new Date(shootDate + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '\u2014'}{' '}
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
