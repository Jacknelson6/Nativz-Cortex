import type { AgencyBrand } from '@/lib/agency/detect';
import { layout } from '@/lib/email/resend';
import type { NotificationPreviewResult } from '../registry';

export async function previewCalendarCommentDigest(
  agency: AgencyBrand,
): Promise<NotificationPreviewResult> {
  const sample = {
    windowLabel: 'Apr 27 → Apr 28',
    groups: [
      {
        clientName: 'Avondale Furnishings',
        dropUrl: 'https://cortex.nativz.io/c/sample-token-1',
        comments: [
          {
            authorName: 'Megan Reed',
            status: 'changes_requested' as const,
            captionPreview: 'Spring drop preview — first walk-through of the…',
            contentPreview:
              'Can we swap out the 3rd clip for one that shows the texture better? Also caption needs to call out the linen blend.',
            createdAt: new Date().toISOString(),
          },
          {
            authorName: 'Megan Reed',
            status: 'comment' as const,
            captionPreview: 'Behind the scenes at the warehouse — quick tour…',
            contentPreview: 'Love this one. Maybe we hold it for next week?',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      {
        clientName: 'SafeStop',
        dropUrl: 'https://cortex.nativz.io/c/sample-token-2',
        comments: [
          {
            authorName: 'Daniel Kim',
            status: 'approved' as const,
            captionPreview: 'Driver-safety reminder — quick install…',
            contentPreview: 'Perfect, ship it.',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
  };

  const totalComments = sample.groups.reduce((sum, g) => sum + g.comments.length, 0);
  const subject = `${totalComments} content calendar ${totalComments === 1 ? 'comment' : 'comments'} · ${sample.windowLabel}`;
  const verbByStatus = {
    approved: 'approved',
    changes_requested: 'requested changes',
    comment: 'commented',
  } as const;

  const sections = sample.groups
    .map((g) => {
      const rows = g.comments
        .map((c) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <div style="font-size:13px;color:#fff;"><strong>${c.authorName}</strong> ${verbByStatus[c.status]}</div>
              <div style="font-size:12px;color:#9aa3b2;margin-top:2px;">on &ldquo;${c.captionPreview}&rdquo;</div>
              ${c.contentPreview ? `<div style="font-size:12px;color:#cbd2dd;margin-top:6px;font-style:italic;">&ldquo;${c.contentPreview}&rdquo;</div>` : ''}
            </td>
          </tr>`)
        .join('');
      return `
        <div style="margin-bottom:24px;">
          <h2 style="font-size:15px;font-weight:600;color:#fff;margin:0 0 8px;">${g.clientName}</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
          <div style="margin-top:12px;"><a href="${g.dropUrl}" style="font-size:12px;color:#5eb6ff;text-decoration:none;">Open ${g.clientName}'s calendar &rarr;</a></div>
        </div>`;
    })
    .join('');

  const html = layout(
    `<p class="subtext">
      ${totalComments} ${totalComments === 1 ? 'comment' : 'comments'} across ${sample.groups.length} ${sample.groups.length === 1 ? 'client' : 'clients'} · ${sample.windowLabel}.
    </p>
    ${sections}`,
    agency,
    {
      eyebrow: `Calendar Digest · ${sample.windowLabel}`,
      heroTitle: "Yesterday's calendar activity",
    },
  );

  return { subject, html };
}
