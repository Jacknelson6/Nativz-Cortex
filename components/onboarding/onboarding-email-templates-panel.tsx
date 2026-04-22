'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Copy, Check, Loader2, Mail, Send, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmailPreview } from '@/components/email/email-preview';
import { interpolateEmail, type EmailContext } from '@/lib/onboarding/interpolate-email';

export type EmailTemplate = {
  id: string;
  service: string;
  name: string;
  subject: string;
  body: string;
};

/**
 * "Email templates" panel rendered at the bottom of the onboarding
 * editor for real (non-template) trackers. Shows every email template
 * for the tracker's service, interpolates variables against the current
 * context (client name, share URL, etc.), and provides one-click copy
 * for subject + body + inline preview so admins can sanity-check rendered
 * HTML before pasting into Gmail.
 */
export function OnboardingEmailTemplatesPanel({
  templates,
  context,
  trackerId,
  defaultRecipientEmail,
}: {
  templates: EmailTemplate[];
  context: EmailContext;
  trackerId?: string;
  defaultRecipientEmail?: string | null;
}) {
  if (templates.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-nativz-border/60 px-5 py-8 text-center">
        <Mail size={24} className="mx-auto text-text-muted/60 mb-2" />
        <p className="text-[13px] text-text-secondary">
          No email templates for {context.service} yet.
        </p>
        <p className="text-[12px] text-text-muted mt-1">
          Create reusable templates (welcome, strategy-call reminder, etc.) so
          every client gets a consistent first touch.
        </p>
        <Link
          href="/admin/onboarding/email-templates"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-text text-background px-3 py-1.5 text-[12px] font-semibold hover:brightness-110 transition"
        >
          <Settings size={12} />
          Manage email templates
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-text-muted">
          Rendered with this tracker&apos;s client + share link. Copy and paste into Gmail.
        </p>
        <Link
          href="/admin/onboarding/email-templates"
          className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-primary transition-colors"
        >
          <Settings size={12} />
          Manage
        </Link>
      </div>
      {templates.map((t) => (
        <EmailTemplateCard
          key={t.id}
          template={t}
          context={context}
          trackerId={trackerId}
          defaultRecipientEmail={defaultRecipientEmail}
        />
      ))}
    </div>
  );
}

function EmailTemplateCard({
  template,
  context,
  trackerId,
  defaultRecipientEmail,
}: {
  template: EmailTemplate;
  context: EmailContext;
  trackerId?: string;
  defaultRecipientEmail?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<'subject' | 'body' | null>(null);
  const [recipient, setRecipient] = useState(defaultRecipientEmail ?? '');
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);

  const renderedSubject = interpolateEmail(template.subject, context);
  const renderedBody = interpolateEmail(template.body, context);

  async function copy(field: 'subject' | 'body', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
      toast.success(`${field === 'subject' ? 'Subject' : 'Body'} copied`);
    } catch {
      toast.error('Copy failed');
    }
  }

  async function send() {
    const to = recipient.trim();
    if (!to) {
      toast.error('Add a recipient email first.');
      return;
    }
    // Basic shape check — server validates rigorously with Zod.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast.error('That doesn\u2019t look like a valid email.');
      return;
    }
    if (!trackerId) {
      toast.error('Send requires a tracker context.');
      return;
    }
    const ok = window.confirm(
      `Send \u201C${template.name}\u201D to ${to}?\n\nThis will deliver immediately via Resend.`,
    );
    if (!ok) return;

    setSending(true);
    try {
      const res = await fetch(`/api/onboarding/trackers/${trackerId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: template.id, to }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to send');
        return;
      }
      toast.success(`Sent to ${to}`);
      setLastSentAt(Date.now());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover/40 transition-colors"
      >
        <div className="h-9 w-9 shrink-0 rounded-full bg-accent-surface text-accent-text flex items-center justify-center">
          <Mail size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-text-primary truncate">{template.name}</p>
          <p className="text-[12px] text-text-muted truncate">
            Subject: {renderedSubject}
          </p>
        </div>
        {lastSentAt && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 shrink-0">
            Sent
          </span>
        )}
        {open ? <ChevronUp size={16} className="text-text-muted shrink-0" /> : <ChevronDown size={16} className="text-text-muted shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-nativz-border px-4 py-4 space-y-4">
          {/* Send-now control: recipient input (pre-filled from primary
              contact when we have one) + Send button. Sits above the copy
              buttons because it's the primary action. */}
          <div className="rounded-lg border border-nativz-border bg-surface-hover/20 p-3 space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Send to
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="client@example.com"
                className="flex-1 min-w-[220px] rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void send()}
                disabled={sending || !recipient.trim()}
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {sending ? 'Sending\u2026' : 'Send now'}
              </Button>
            </div>
            <p className="text-[11px] text-text-muted">
              Delivered via Resend with full brand rendering. Every send is logged.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copy('subject', renderedSubject)}
            >
              {copiedField === 'subject' ? <Check size={13} /> : <Copy size={13} />}
              Copy subject
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copy('body', renderedBody)}
            >
              {copiedField === 'body' ? <Check size={13} /> : <Copy size={13} />}
              Copy body
            </Button>
          </div>

          {/* Inline preview — resolves placeholders against THIS tracker's
              real client + contact + share URL on the server. */}
          <EmailPreview
            input={{
              kind: 'onboarding',
              subject: template.subject,
              body: template.body,
              trackerId,
            }}
          />
        </div>
      )}
    </div>
  );
}
