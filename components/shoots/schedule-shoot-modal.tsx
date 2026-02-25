'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Calendar,
  Mail,
  Users,
  X,
  Check,
  AlertTriangle,
  Building2,
  Search,
  Copy,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';

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

interface ClientOption {
  id: string;
  name: string;
  agency?: string;
  poc_email?: string;
}

interface ScheduleShootModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  shoot?: ShootData;
  prefilledDate?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleShootModal({ open, onClose, onCreated, shoot, prefilledDate }: ScheduleShootModalProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Client picker state (when no shoot is provided)
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Step 1: Shoot details
  const [clientName, setClientName] = useState(shoot?.clientName ?? '');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(shoot?.clientId ?? null);
  const [shootDate, setShootDate] = useState(shoot?.date ?? prefilledDate ?? '');
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

  // Draft email state
  const [schedulingLinks, setSchedulingLinks] = useState<Record<string, string>>({});
  const [showDraftEmail, setShowDraftEmail] = useState(false);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftTo, setDraftTo] = useState('');

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

  // Fetch clients and scheduling links
  useEffect(() => {
    if (!open) return;
    async function fetchClients() {
      const supabase = createClient();
      const { data } = await supabase
        .from('clients')
        .select('id, name, agency, poc_email')
        .eq('is_active', true)
        .order('name');
      if (data) setClients(data);
    }
    async function fetchSchedulingLinks() {
      try {
        const res = await fetch('/api/settings/scheduling');
        if (!res.ok) return;
        const { settings } = await res.json();
        const links: Record<string, string> = {};
        for (const s of settings) {
          if (s.scheduling_link) links[s.agency] = s.scheduling_link;
        }
        setSchedulingLinks(links);
      } catch { /* silent */ }
    }
    fetchClients();
    fetchSchedulingLinks();
  }, [open]);

  // Close client dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    }
    if (clientDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [clientDropdownOpen]);

  // Sync state when shoot prop changes
  useEffect(() => {
    if (open) {
      setStep(1);
      setClientName(shoot?.clientName ?? '');
      setSelectedClientId(shoot?.clientId ?? null);
      setShootDate(shoot?.date ?? prefilledDate ?? '');
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
      setClientSearch('');
      setClientDropdownOpen(false);
      setShowDraftEmail(false);
      setDraftSubject('');
      setDraftBody('');
      setDraftTo('');

      const detectedAgency = (() => {
        const sa = shoot?.agency?.toLowerCase() ?? '';
        if (sa.includes('anderson')) return 'Anderson Collaborative';
        return 'Nativz';
      })();
      setAgency(detectedAgency);
      initTeamSelection(detectedAgency, shoot?.clientName ?? '');
    }
  }, [open, shoot?.clientName, shoot?.date, shoot?.location, shoot?.notes, shoot?.pocEmails, shoot?.agency, prefilledDate]);

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

  function generateDraftEmail() {
    const client = clients.find((c) => c.id === selectedClientId);
    const clientAgencyKey = agency.toLowerCase().includes('anderson') ? 'ac' : 'nativz';
    const link = schedulingLinks[clientAgencyKey] || '';
    const to = client?.poc_email || shoot?.pocEmails?.[0] || '';
    const name = clientName || 'there';

    const subject = `Schedule Your Content Shoot - ${clientName}`;
    const body = `Hi ${name.split(' ')[0]},

Hope you're doing well! We're reaching out to get your next content shoot on the calendar.

${link ? `Please use the link below to select a date and time that works best for you:\n\n${link}\n` : ''}${shootDate ? `We're currently looking at ${new Date(shootDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} — let us know if that works for your schedule.\n` : ''}
If you have any questions or need to adjust anything, don't hesitate to reach out.

Looking forward to it!

Best,
${agency === 'Anderson Collaborative' ? 'The Anderson Collaborative Team' : 'The Nativz Team'}`;

    setDraftTo(to);
    setDraftSubject(subject);
    setDraftBody(body);
    setShowDraftEmail(true);
  }

  function copyDraftToClipboard() {
    const full = `To: ${draftTo}\nSubject: ${draftSubject}\n\n${draftBody}`;
    navigator.clipboard.writeText(full);
    toast.success('Email draft copied to clipboard');
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/shoots/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName,
          client_id: selectedClientId ?? shoot?.clientId ?? null,
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
            {shoot?.clientName ? (
              <div className="rounded-lg border border-nativz-border bg-surface-hover/50 px-3 py-2 text-sm text-text-primary">
                {clientName || 'Unknown client'}
              </div>
            ) : (
              <div className="relative" ref={clientDropdownRef}>
                {selectedClientId && clientName ? (
                  <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-surface px-3 py-2">
                    <Building2 size={14} className="text-accent-text" />
                    <span className="text-sm font-medium text-accent-text flex-1">{clientName}</span>
                    <button
                      type="button"
                      onClick={() => { setSelectedClientId(null); setClientName(''); }}
                      className="cursor-pointer text-text-muted hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
                    className="cursor-pointer w-full flex items-center gap-2 rounded-lg border border-dashed border-nativz-border px-3 py-2 text-sm text-text-muted hover:border-text-muted hover:text-text-secondary transition-colors"
                  >
                    <Building2 size={14} />
                    Select a client
                    <ChevronDown size={12} className="ml-auto" />
                  </button>
                )}
                {clientDropdownOpen && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-nativz-border bg-surface shadow-dropdown animate-fade-in">
                    <div className="sticky top-0 bg-surface border-b border-nativz-border p-2">
                      <div className="flex items-center gap-2 rounded-md border border-nativz-border bg-surface-hover/50 px-2.5 py-1.5">
                        <Search size={12} className="text-text-muted" />
                        <input
                          type="text"
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          placeholder="Search clients..."
                          className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
                          autoFocus
                        />
                      </div>
                    </div>
                    {clients
                      .filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                      .map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => {
                            setSelectedClientId(client.id);
                            setClientName(client.name);
                            setClientDropdownOpen(false);
                            setClientSearch('');
                          }}
                          className="cursor-pointer flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover transition-colors"
                        >
                          <Building2 size={12} className="text-text-muted" />
                          {client.name}
                        </button>
                      ))}
                    {clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-xs text-text-muted">No clients found</p>
                    )}
                  </div>
                )}
              </div>
            )}
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

          {/* Draft Email */}
          {clientName && (
            <div className="pt-2 border-t border-nativz-border">
              {!showDraftEmail ? (
                <Button type="button" variant="ghost" size="sm" onClick={generateDraftEmail}>
                  <FileText size={14} />
                  Draft scheduling email
                </Button>
              ) : (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide">Email draft</h4>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" variant="ghost" size="sm" onClick={copyDraftToClipboard}>
                        <Copy size={12} />
                        Copy
                      </Button>
                      <button type="button" onClick={() => setShowDraftEmail(false)} className="cursor-pointer text-text-muted hover:text-text-secondary">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <Input
                    id="draft-to"
                    label="To"
                    type="email"
                    value={draftTo}
                    onChange={(e) => setDraftTo(e.target.value)}
                    placeholder="client@email.com"
                  />
                  <Input
                    id="draft-subject"
                    label="Subject"
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                  />
                  <Textarea
                    id="draft-body"
                    label="Body"
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={10}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <GlassButton onClick={() => setStep(2)} disabled={!shootDate || !clientName}>
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
