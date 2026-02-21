'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Clock, Send, Undo2, Building2, Check, Plus, X, Mail, Users, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { MetricsRow } from '@/components/results/metrics-row';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { ContentPillars } from '@/components/results/content-pillars';
import { NicheInsights } from '@/components/results/niche-insights';
import { SourcesPanel } from '@/components/results/sources-panel';
import { ActivityChart } from '@/components/charts/activity-chart';
import { SearchProgress } from '@/components/search/search-progress';
import { formatRelativeTime } from '@/lib/utils/format';
import { hasSerp } from '@/lib/types/search';
import type { TopicSearch, TopicSearchAIResponse } from '@/lib/types/search';
import type { Recipient } from './page';

interface AdminResultsClientProps {
  search: TopicSearch;
  clientInfo?: { id: string; name: string; slug: string } | null;
  recipients?: Recipient[];
}

export function AdminResultsClient({ search, clientInfo, recipients = [] }: AdminResultsClientProps) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const aiResponse = search.raw_ai_response as TopicSearchAIResponse | null;

  async function handleSend(action: 'approve' | 'reject') {
    setSending(true);
    try {
      const res = await fetch(`/api/search/${search.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const name = clientInfo?.name;
        toast.success(
          action === 'approve'
            ? `Report sent to ${name || 'client'}`
            : 'Report unsent'
        );
        router.refresh();
      } else {
        toast.error('Something went wrong. Try again.');
      }
    } finally {
      setSending(false);
    }
  }

  if (search.status === 'processing' || search.status === 'pending') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4">
        <p className="text-lg font-semibold text-text-primary mb-2">
          Researching &ldquo;{search.query}&rdquo;
        </p>
        <p className="text-sm text-text-muted mb-8">This usually takes 1-2 minutes</p>
        <SearchProgress />
      </div>
    );
  }

  if (search.status === 'failed') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4">
        <p className="text-sm text-red-400 mb-4">{search.summary || 'Search failed. Try again.'}</p>
        <Link href="/admin/search/new">
          <Button variant="outline">New search</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-4 px-6">
          <Link href="/admin/search/history" className="text-text-muted hover:text-text-secondary transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-text-primary">{search.query}</span>
            <span className="text-text-muted">/</span>
            <span className="text-text-muted">Results</span>
            {clientInfo && (
              <>
                <span className="text-text-muted">/</span>
                <Link
                  href={`/admin/clients/${clientInfo.slug}`}
                  className="flex items-center gap-1 text-accent-text hover:text-accent-hover transition-colors"
                >
                  <Building2 size={12} />
                  {clientInfo.name}
                </Link>
              </>
            )}
            {!clientInfo && search.client_id === null && (
              <>
                <span className="text-text-muted">/</span>
                <span className="text-xs text-text-muted">No client attached</span>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {search.completed_at && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-text-muted">
                <Clock size={12} />
                {formatRelativeTime(search.completed_at)}
              </span>
            )}
            {search.approved_at ? (
              <>
                <Badge variant="success">Sent</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSend('reject')}
                  disabled={sending}
                >
                  <Undo2 size={14} />
                  Unsend
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => setShowSendModal(true)}
                disabled={sending}
              >
                <Send size={14} />
                Send report
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {aiResponse?.brand_alignment_notes ? (
          <ExecutiveSummary summary={aiResponse.brand_alignment_notes} variant="brand" />
        ) : (
          search.summary && <ExecutiveSummary summary={search.summary} />
        )}
        {search.metrics && <MetricsRow metrics={search.metrics} isBrandSearch={!!aiResponse?.brand_alignment_notes} />}

        {search.activity_data && search.activity_data.length > 0 && (
          <ActivityChart data={search.activity_data} />
        )}

        {(search.emotions || search.content_breakdown) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {search.emotions && search.emotions.length > 0 && (
              <EmotionsBreakdown emotions={search.emotions} />
            )}
            {search.content_breakdown && (
              <ContentBreakdown data={search.content_breakdown} />
            )}
          </div>
        )}
        {search.trending_topics && search.trending_topics.length > 0 && (
          <TrendingTopicsTable topics={search.trending_topics} clientId={clientInfo?.id} searchId={search.id} />
        )}

        {(aiResponse?.content_pillars || aiResponse?.niche_performance_insights) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {aiResponse.content_pillars && aiResponse.content_pillars.length > 0 && (
              <ContentPillars pillars={aiResponse.content_pillars} />
            )}
            {aiResponse.niche_performance_insights && (
              <NicheInsights insights={aiResponse.niche_performance_insights} />
            )}
          </div>
        )}

        {hasSerp(search) && search.serp_data && (
          <SourcesPanel serpData={search.serp_data} />
        )}
      </div>

      <ScrollToTop />

      {/* Send report modal */}
      <SendReportModal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        recipients={recipients}
        clientName={clientInfo?.name}
        sending={sending}
        onSend={async () => {
          await handleSend('approve');
          setShowSendModal(false);
        }}
      />
    </div>
  );
}

// ─── Send report modal ──────────────────────────────────────────────────────

function SendReportModal({
  open,
  onClose,
  recipients,
  clientName,
  sending,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  recipients: Recipient[];
  clientName?: string;
  sending: boolean;
  onSend: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customEmail, setCustomEmail] = useState('');
  const [customEmails, setCustomEmails] = useState<string[]>([]);

  const teamRecipients = recipients.filter((r) => r.group === 'team');
  const clientRecipients = recipients.filter((r) => r.group === 'client');

  function toggleRecipient(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addCustomEmail() {
    const email = customEmail.trim().toLowerCase();
    if (email && email.includes('@') && !customEmails.includes(email)) {
      setCustomEmails((prev) => [...prev, email]);
      setCustomEmail('');
    }
  }

  function removeCustomEmail(email: string) {
    setCustomEmails((prev) => prev.filter((e) => e !== email));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomEmail();
    }
  }

  const totalRecipients = selected.size + customEmails.length;

  return (
    <Dialog open={open} onClose={onClose} title="Send report" maxWidth="md">
      <p className="text-sm text-text-muted mb-5">
        Select who should receive this report{clientName ? ` for ${clientName}` : ''}.
      </p>

      <div className="space-y-5">
        {/* Team members */}
        {teamRecipients.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Users size={14} className="text-accent-text" />
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Nativz team</h3>
            </div>
            <div className="space-y-1.5">
              {teamRecipients.map((r) => (
                <RecipientCheckbox
                  key={r.id}
                  name={r.name}
                  email={r.email}
                  checked={selected.has(r.id)}
                  onChange={() => toggleRecipient(r.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Client contacts */}
        {clientRecipients.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <User size={14} className="text-emerald-400" />
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                {clientName || 'Client'} contacts
              </h3>
            </div>
            <div className="space-y-1.5">
              {clientRecipients.map((r) => (
                <RecipientCheckbox
                  key={r.id}
                  name={r.name}
                  email={r.email}
                  checked={selected.has(r.id)}
                  onChange={() => toggleRecipient(r.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Custom email */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Mail size={14} className="text-purple-400" />
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Custom email</h3>
          </div>
          <div className="flex gap-2">
            <input
              type="email"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter email address"
              className="flex-1 rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none transition-colors"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addCustomEmail}
              disabled={!customEmail.trim().includes('@')}
            >
              <Plus size={14} />
              Add
            </Button>
          </div>
          {customEmails.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2.5">
              {customEmails.map((email) => (
                <span
                  key={email}
                  className="flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface-hover px-3 py-1 text-xs text-text-secondary"
                >
                  {email}
                  <button onClick={() => removeCustomEmail(email)} className="text-text-muted hover:text-red-400 transition-colors">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-nativz-border">
        <span className="text-xs text-text-muted">
          {totalRecipients === 0 ? 'No recipients selected' : `${totalRecipients} recipient${totalRecipients === 1 ? '' : 's'} selected`}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onSend}
            disabled={sending || totalRecipients === 0}
          >
            <Send size={14} />
            {sending ? 'Sending...' : 'Send report'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function RecipientCheckbox({
  name,
  email,
  checked,
  onChange,
}: {
  name: string;
  email: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        checked
          ? 'border-accent/40 bg-accent-surface/50'
          : 'border-nativz-border-light bg-surface-hover hover:border-accent/20'
      }`}
    >
      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
        checked
          ? 'border-accent bg-accent text-white'
          : 'border-nativz-border bg-surface'
      }`}>
        {checked && <Check size={12} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary truncate">{name}</p>
        <p className="text-xs text-text-muted truncate">{email}</p>
      </div>
    </button>
  );
}
