import { layout } from '@/lib/email/resend';
import type { AgencyBrand } from '@/lib/agency/detect';
import type { NotificationPreviewResult } from '../registry';

const SAMPLE_CLIENT = 'Avondale Furnishings';
const SAMPLE_URL = 'https://cortex.nativz.io/c/sample-token';

export async function previewCalendarNoOpenNudge(
  agency: AgencyBrand,
): Promise<NotificationPreviewResult> {
  const html = layout(`
    <div class="card">
      <h1 class="heading">Your content calendar is waiting</h1>
      <p class="subtext">Hey ${SAMPLE_CLIENT} — we sent over your latest content calendar about 48 hours ago and it hasn't been opened yet. Take a quick look and let us know if anything needs tweaking.</p>
      <div style="margin-top:18px;">
        <a href="${SAMPLE_URL}" class="btn">Open your calendar</a>
      </div>
    </div>
  `, agency);
  return { subject: 'Friendly nudge — your content calendar is ready to review', html };
}

export async function previewCalendarNoActionNudge(
  agency: AgencyBrand,
): Promise<NotificationPreviewResult> {
  const html = layout(`
    <div class="card">
      <h1 class="heading">How's the calendar looking?</h1>
      <p class="subtext">Hey ${SAMPLE_CLIENT} — you opened the calendar but haven't approved or requested changes on any posts yet. We just want to make sure nothing's blocking you. Hit reply or drop comments directly on the posts.</p>
      <div style="margin-top:18px;">
        <a href="${SAMPLE_URL}" class="btn">Review the posts</a>
      </div>
    </div>
  `, agency);
  return { subject: 'Quick check-in on your content calendar', html };
}

export async function previewCalendarFinalCall(
  agency: AgencyBrand,
): Promise<NotificationPreviewResult> {
  const sampleFirstPost = 'Tuesday at 9:00 AM CDT';
  const html = layout(`
    <div class="card">
      <h1 class="heading">Final call before we publish</h1>
      <p class="subtext">Hey ${SAMPLE_CLIENT} — your first scheduled post goes live ${sampleFirstPost}. We haven't heard back yet, so unless you flag something we'll publish on the dates you saw in the calendar.</p>
      <p class="subtext" style="margin-top:10px;">If anything needs to change, drop a comment on the post or hit reply now.</p>
      <div style="margin-top:18px;">
        <a href="${SAMPLE_URL}" class="btn">Open the calendar</a>
      </div>
    </div>
  `, agency);
  return { subject: `Heads up — first post goes live ${sampleFirstPost}`, html };
}

export async function previewCalendarRevisionsComplete(
  agency: AgencyBrand,
): Promise<NotificationPreviewResult> {
  const html = layout(`
    <div class="card">
      <h1 class="heading">Revisions complete</h1>
      <p class="subtext">Hey ${SAMPLE_CLIENT} — we've worked through every change you flagged. Hop back in to take a final look and approve the posts you're happy with.</p>
      <div style="margin-top:18px;">
        <a href="${SAMPLE_URL}" class="btn">Review the updated posts</a>
      </div>
    </div>
  `, agency);
  return { subject: 'Your revisions are ready to review', html };
}
