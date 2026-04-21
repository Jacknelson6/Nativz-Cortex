import { Resend } from 'resend';
import { getFromAddress, getReplyTo } from '@/lib/email/resend';
import { buildUserEmailHtml } from '@/lib/email/templates/user-email';
import { resolveMergeFields } from '@/lib/email/merge-fields';
import { getSecret } from '@/lib/secrets/store';
import type { MergeContext } from '@/lib/email/types';
import type { AgencyBrand } from '@/lib/agency/detect';

let _resend: Resend | null = null;
let _resendKey: string | undefined;
async function client(): Promise<Resend> {
  const apiKey = (await getSecret('RESEND_API_KEY')) ?? '';
  if (!_resend || _resendKey !== apiKey) {
    _resend = new Resend(apiKey);
    _resendKey = apiKey;
  }
  return _resend;
}

export interface SendUserEmailInput {
  to: string;
  subject: string;
  bodyMarkdown: string;
  mergeContext: MergeContext;
  agency: AgencyBrand;
}

export interface SendUserEmailSuccess {
  ok: true;
  id: string;
  resolvedSubject: string;
  resolvedBody: string;
}

export interface SendUserEmailFailure {
  ok: false;
  error: string;
}

export async function sendUserEmail(input: SendUserEmailInput): Promise<SendUserEmailSuccess | SendUserEmailFailure> {
  if (!input.to.trim()) {
    return { ok: false, error: 'recipient has no email' };
  }
  const resolvedSubject = resolveMergeFields(input.subject, input.mergeContext);
  const resolvedBody = resolveMergeFields(input.bodyMarkdown, input.mergeContext);
  const html = buildUserEmailHtml(resolvedBody, input.agency);

  try {
    const res = await (await client()).emails.send({
      from: getFromAddress(input.agency),
      replyTo: getReplyTo(input.agency),
      to: input.to,
      subject: resolvedSubject,
      html,
    });
    if (res.error) {
      return { ok: false, error: res.error.message || 'resend error' };
    }
    const id = res.data?.id;
    if (!id) return { ok: false, error: 'resend returned no id' };
    return { ok: true, id, resolvedSubject, resolvedBody };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown send error' };
  }
}
