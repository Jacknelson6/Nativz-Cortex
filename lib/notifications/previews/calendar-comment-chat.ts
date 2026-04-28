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
        Every post in the latest content calendar has been approved. Nothing left to review — we'll publish on the scheduled dates.
      </div>
      <a class="link" href="#">Open content calendar →</a>
    </div>
  `);
  return { subject: 'All-approved ping (chat)', html };
}
