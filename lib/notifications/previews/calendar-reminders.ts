import {
  layout,
  buildCalendarCadenceFollowupDraft,
  buildEditingCadenceFollowupDraft,
  type CadenceStage,
} from '@/lib/email/resend';
import type { AgencyBrand } from '@/lib/agency/detect';
import type { NotificationPreviewResult } from '../registry';

const SAMPLE_CLIENT = 'Avondale Furnishings';
const SAMPLE_PROJECT = 'May Reels Batch';
const SAMPLE_POC_FIRST_NAMES = ['Megan'];
const SAMPLE_URL = 'https://cortex.nativz.io/c/sample-token';
const SAMPLE_EDITING_URL = 'https://cortex.nativz.io/c/edit/sample-token';

export async function previewCalendarNoOpenNudge(
  agency: AgencyBrand,
): Promise<NotificationPreviewResult> {
  const html = layout(
    `<p class="subtext">Hey ${SAMPLE_CLIENT}, we sent over your latest content calendar about 48 hours ago and it hasn't been opened yet. Take a quick look and let us know if anything needs tweaking.</p>
    <div class="button-wrap"><a href="${SAMPLE_URL}" class="button">Open your calendar &rarr;</a></div>`,
    agency,
    {
      eyebrow: 'Calendar Reminder',
      heroTitle: 'Your content calendar is waiting',
    },
  );
  return { subject: 'Friendly nudge: your content calendar is ready to review', html };
}

export async function previewCalendarNoActionNudge(
  agency: AgencyBrand,
): Promise<NotificationPreviewResult> {
  const html = layout(
    `<p class="subtext">Hey ${SAMPLE_CLIENT}, you opened the calendar but haven't approved or requested changes on any posts yet. We just want to make sure nothing's blocking you. Hit reply or leave comments directly on the posts.</p>
    <div class="button-wrap"><a href="${SAMPLE_URL}" class="button">Review the posts &rarr;</a></div>`,
    agency,
    {
      eyebrow: 'Calendar Reminder',
      heroTitle: "How's the calendar looking?",
    },
  );
  return { subject: 'Quick check-in on your content calendar', html };
}

export async function previewCalendarFinalCall(
  agency: AgencyBrand,
): Promise<NotificationPreviewResult> {
  const sampleFirstPost = 'Tuesday at 9:00 AM CDT';
  const html = layout(
    `<p class="subtext">Hey ${SAMPLE_CLIENT}, your first scheduled post goes live ${sampleFirstPost}. We haven't heard back yet, so unless you flag something we'll publish on the dates you saw in the calendar.</p>
    <p class="subtext" style="margin-top:10px;">If anything needs to change, leave a comment on the post or hit reply now.</p>
    <div class="button-wrap"><a href="${SAMPLE_URL}" class="button">Open the calendar &rarr;</a></div>`,
    agency,
    {
      eyebrow: 'Final Call',
      heroTitle: 'Final call before we publish',
    },
  );
  return { subject: `Heads up: first post goes live ${sampleFirstPost}`, html };
}

export async function previewCalendarRevisionsComplete(
  agency: AgencyBrand,
): Promise<NotificationPreviewResult> {
  const html = layout(
    `<p class="subtext">Hey ${SAMPLE_CLIENT}, we've worked through every change you flagged. Hop back in to take a final look and approve the posts you're happy with.</p>
    <div class="button-wrap"><a href="${SAMPLE_URL}" class="button">Review the updated posts &rarr;</a></div>`,
    agency,
    {
      eyebrow: 'Revisions Complete',
      heroTitle: 'Revisions complete',
    },
  );
  return { subject: 'Your revisions are ready to review', html };
}

export async function previewEditingRevisionsComplete(
  agency: AgencyBrand,
): Promise<NotificationPreviewResult> {
  const html = layout(
    `<p class="subtext">Hey ${SAMPLE_CLIENT}, we've worked through every change you flagged on ${SAMPLE_PROJECT}. Hop back in to take a final look and approve the cuts you're happy with.</p>
    <div class="button-wrap"><a href="${SAMPLE_EDITING_URL}" class="button">Review the updated cuts &rarr;</a></div>`,
    agency,
    {
      eyebrow: 'Revisions Complete',
      heroTitle: 'Revisions complete',
    },
  );
  return {
    subject: `Your ${SAMPLE_PROJECT} revisions are ready to review`,
    html,
  };
}

function paragraphsFromMessage(message: string): string {
  return message
    .split(/\n{2,}/)
    .map((p) => `<p class="subtext">${p}</p>`)
    .join('\n');
}

export async function previewCalendarCadenceFollowup(
  agency: AgencyBrand,
  stage: CadenceStage = 1,
): Promise<NotificationPreviewResult> {
  const draft = buildCalendarCadenceFollowupDraft({
    stage,
    pocFirstNames: SAMPLE_POC_FIRST_NAMES,
    clientName: SAMPLE_CLIENT,
  });
  const eyebrow = stage === 3 ? 'Final Call' : 'Calendar Check-In';
  const ctaLabel = stage === 3 ? 'Open the calendar' : 'Review the posts';
  const html = layout(
    `${paragraphsFromMessage(draft.message)}
     <div class="button-wrap"><a href="${SAMPLE_URL}" class="button">${ctaLabel} &rarr;</a></div>`,
    agency,
    { eyebrow, heroTitle: draft.heroTitle },
  );
  return { subject: draft.subject, html };
}

export async function previewEditingCadenceFollowup(
  agency: AgencyBrand,
  stage: CadenceStage = 1,
): Promise<NotificationPreviewResult> {
  const draft = buildEditingCadenceFollowupDraft({
    stage,
    pocFirstNames: SAMPLE_POC_FIRST_NAMES,
    clientName: SAMPLE_CLIENT,
    projectName: SAMPLE_PROJECT,
  });
  const eyebrow = stage === 3 ? 'Final Call' : 'Editing Check-In';
  const html = layout(
    `${paragraphsFromMessage(draft.message)}
     <div class="button-wrap"><a href="${SAMPLE_EDITING_URL}" class="button">Review the cuts &rarr;</a></div>`,
    agency,
    { eyebrow, heroTitle: draft.heroTitle },
  );
  return { subject: draft.subject, html };
}
