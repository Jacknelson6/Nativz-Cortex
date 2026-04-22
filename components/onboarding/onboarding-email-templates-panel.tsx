'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Copy, Check, Mail, Settings } from 'lucide-react';
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
}: {
  templates: EmailTemplate[];
  context: EmailContext;
  trackerId?: string;
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
        <EmailTemplateCard key={t.id} template={t} context={context} trackerId={trackerId} />
      ))}
    </div>
  );
}

function EmailTemplateCard({
  template,
  context,
  trackerId,
}: {
  template: EmailTemplate;
  context: EmailContext;
  trackerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<'subject' | 'body' | null>(null);

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
        {open ? <ChevronUp size={16} className="text-text-muted shrink-0" /> : <ChevronDown size={16} className="text-text-muted shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-nativz-border px-4 py-4 space-y-4">
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
