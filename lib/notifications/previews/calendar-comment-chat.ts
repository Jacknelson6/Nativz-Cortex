import type { NotificationPreviewResult } from '../registry';

/**
 * Google Chat doesn't render styled HTML — it consumes a `text:` payload (or
 * card v2 JSON). For the admin preview we mock up what the user sees in the
 * Chat space using a simple card layout, since the iframe can't render the
 * Chat client.
 */

function chatFrame(body: string): string {
  return `
    <html>
      <head>
        <style>
          body { background:#0e1015; color:#e6e8eb; font-family:'Inter','Helvetica Neue',sans-serif; padding:24px; margin:0; }
          .card { max-width:560px; background:#191b22; border:1px solid #2a2d36; border-radius:12px; padding:18px 20px; }
          .room { font-size:11px; color:#8a91a0; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; }
          .who { font-size:13px; font-weight:600; color:#fff; }
          .body { font-size:14px; color:#cbd2dd; margin-top:6px; line-height:1.45; }
          .link { display:inline-block; margin-top:10px; font-size:12px; color:#5eb6ff; text-decoration:none; }
        </style>
      </head>
      <body>${body}</body>
    </html>`;
}

export async function previewCalendarCommentChat(): Promise<NotificationPreviewResult> {
  const html = chatFrame(`
    <div class="card">
      <div class="room">Avondale Furnishings · Cortex bot</div>
      <div class="who">Megan Reed requested changes</div>
      <div class="body">
        <em>"Can we swap out the 3rd clip for one that shows the texture better? Also caption needs to call out the linen blend."</em>
        <div style="margin-top:8px;font-size:12px;color:#9aa3b2;">on "Spring drop preview — first walk-through of the…"</div>
      </div>
      <a class="link" href="#">Open content calendar →</a>
    </div>
  `);
  return { subject: 'Comment ping (chat)', html };
}

export async function previewCalendarAllApprovedChat(): Promise<NotificationPreviewResult> {
  const html = chatFrame(`
    <div class="card">
      <div class="room">Avondale Furnishings · Cortex bot</div>
      <div class="who">All 8 posts approved 🎉</div>
      <div class="body">
        Every post in the latest content calendar has been approved. Nothing left to review, we'll publish on the scheduled dates.
      </div>
      <a class="link" href="#">Open content calendar →</a>
    </div>
  `);
  return { subject: 'All-approved ping (chat)', html };
}

export async function previewEditingCommentChat(): Promise<NotificationPreviewResult> {
  const html = chatFrame(`
    <div class="card">
      <div class="room">Avondale Furnishings · Cortex bot</div>
      <div class="who">Megan Reed requested changes on May Reels Batch</div>
      <div class="body">
        <em>"Cut 2 needs the captions repositioned, they overlap the product. Otherwise the pacing on the rest looks great."</em>
        <div style="margin-top:8px;font-size:12px;color:#9aa3b2;">on cut "Reel-02-walkthrough.mp4"</div>
      </div>
      <a class="link" href="#">Open editing review →</a>
    </div>
  `);
  return { subject: 'Editing comment ping (chat)', html };
}

export async function previewCalendarAutoApproveChat(): Promise<NotificationPreviewResult> {
  const html = chatFrame(`
    <div class="card">
      <div class="room">Cortex ops</div>
      <div class="who">✅ Auto-approved 6 posts on Avondale Furnishings' calendar</div>
      <div class="body">
        No client activity for 9 days after the 3-stage follow-up cadence completed. Posts are queued to publish on their scheduled dates.
      </div>
      <a class="link" href="#">Open content calendar →</a>
    </div>
  `);
  return { subject: 'Calendar auto-approve ping (chat)', html };
}

export async function previewEditingAutoApproveChat(): Promise<NotificationPreviewResult> {
  const html = chatFrame(`
    <div class="card">
      <div class="room">Cortex ops</div>
      <div class="who">✅ Auto-approved 4 cuts on Avondale Furnishings · May Reels Batch</div>
      <div class="body">
        No client activity for 9 days after the 3-stage follow-up cadence completed. Cuts are flagged approved and ready to deliver.
      </div>
      <a class="link" href="#">Open editing project →</a>
    </div>
  `);
  return { subject: 'Editing auto-approve ping (chat)', html };
}
