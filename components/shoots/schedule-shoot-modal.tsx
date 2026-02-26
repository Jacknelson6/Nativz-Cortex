'use client';

import { useState, useEffect } from 'react';
import {
  Building2,
  Check,
  Copy,
  ChevronDown,
  FileText,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GlassButton } from '@/components/ui/glass-button';
import { Textarea } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

interface ClientOption {
  id: string;
  name: string;
  agency?: string;
  poc_email?: string;
}

interface DraftEmail {
  clientName: string;
  to: string;
  subject: string;
  body: string;
}

interface ScheduleShootsModalProps {
  open: boolean;
  initialClientId?: string | null;
  onClose: () => void;
}

export function ScheduleShootsModal({ open, onClose, initialClientId }: ScheduleShootsModalProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [schedulingLinks, setSchedulingLinks] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<DraftEmail[]>([]);
  const [step, setStep] = useState<'select' | 'drafts'>('select');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setStep('select');
    setSelectedIds(new Set(initialClientId ? [initialClientId] : []));
    setDrafts([]);
    setSearch('');

    async function load() {
      setLoading(true);
      const supabase = createClient();
      const [clientsRes, linksRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('is_active', true).order('name'),
        fetch('/api/settings/scheduling').then((r) => r.ok ? r.json() : { settings: [] }),
      ]);
      if (clientsRes.data) setClients(clientsRes.data);
      const links: Record<string, string> = {};
      for (const s of linksRes.settings) {
        if (s.scheduling_link) links[s.agency] = s.scheduling_link;
      }
      setSchedulingLinks(links);
      setLoading(false);
    }
    load();
  }, [open]);

  function toggleClient(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function generateDrafts() {
    const selected = clients.filter((c) => selectedIds.has(c.id));
    const newDrafts: DraftEmail[] = selected.map((client) => {
      const agencyKey = client.agency?.toLowerCase().includes('anderson') ? 'ac' : 'nativz';
      const agencyName = agencyKey === 'ac' ? 'Anderson Collaborative' : 'Nativz';
      const link = schedulingLinks[agencyKey] || '';

      return {
        clientName: client.name,
        to: client.poc_email || '',
        subject: `Schedule Your Content Shoot - ${client.name}`,
        body: `Hi ${client.name.split(' ')[0]},

Hope you're doing well! We're reaching out to get your next content shoot on the calendar.

${link ? `Please use the link below to select a date and time that works best for you:\n\n${link}\n` : ''}If you have any questions or need to adjust anything, don't hesitate to reach out.

Looking forward to it!

Best,
The ${agencyName} Team`,
      };
    });
    setDrafts(newDrafts);
    setStep('drafts');
  }

  function copyDraft(draft: DraftEmail) {
    const full = `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`;
    navigator.clipboard.writeText(full);
    toast.success(`Copied draft for ${draft.clientName}`);
  }

  function copyAllDrafts() {
    const all = drafts.map((d) => `--- ${d.clientName} ---\nTo: ${d.to}\nSubject: ${d.subject}\n\n${d.body}`).join('\n\n');
    navigator.clipboard.writeText(all);
    toast.success(`Copied ${drafts.length} email drafts`);
  }

  function updateDraftBody(index: number, body: string) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, body } : d)));
  }

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onClose={onClose} title="Schedule shoots" maxWidth="lg">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      ) : step === 'select' ? (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Select clients to generate scheduling email drafts.</p>

          {/* Search */}
          <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface-hover/50 px-3 py-2">
            <Search size={14} className="text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>

          {/* Client list */}
          <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-nativz-border p-2">
            {filtered.map((client) => {
              const isSelected = selectedIds.has(client.id);
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => toggleClient(client.id)}
                  className={`cursor-pointer w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'bg-accent/15 border border-accent/30'
                      : 'hover:bg-surface-hover border border-transparent'
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full transition-all ${
                    isSelected ? 'bg-accent text-white' : 'bg-white/[0.06]'
                  }`}>
                    {isSelected && <Check size={10} />}
                  </span>
                  <Building2 size={12} className="text-text-muted" />
                  <span className="text-sm text-text-primary flex-1">{client.name}</span>
                  {client.agency && (
                    <span className="text-[10px] text-text-muted">{client.agency}</span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-text-muted">{selectedIds.size} client{selectedIds.size !== 1 ? 's' : ''} selected</p>

          <div className="flex justify-end pt-2">
            <GlassButton onClick={generateDrafts} disabled={selectedIds.size === 0}>
              <FileText size={14} />
              Generate {selectedIds.size} draft{selectedIds.size !== 1 ? 's' : ''}
            </GlassButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep('select')}>
              ← Back to selection
            </Button>
            <GlassButton onClick={copyAllDrafts}>
              <Copy size={14} />
              Copy all ({drafts.length})
            </GlassButton>
          </div>

          <div className="max-h-[60vh] overflow-y-auto space-y-3">
            {drafts.map((draft, i) => (
              <div key={i} className="rounded-lg border border-nativz-border bg-surface-hover/30 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-text-primary">{draft.clientName}</h4>
                    <p className="text-xs text-text-muted">To: {draft.to || '(no email on file)'}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyDraft(draft)}>
                    <Copy size={12} />
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-text-secondary">Subject: {draft.subject}</p>
                <Textarea
                  id={`draft-body-${i}`}
                  value={draft.body}
                  onChange={(e) => updateDraftBody(i, e.target.value)}
                  rows={6}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
