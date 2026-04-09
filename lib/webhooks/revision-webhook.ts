/**
 * Send revision notifications to a configured webhook (Google Chat format).
 */

export interface RevisionPayload {
  clientName: string;
  postCaption: string;
  reviewerName: string;
  comment: string;
  status: 'approved' | 'changes_requested' | 'comment';
  postUrl?: string;
}

const STATUS_LABELS: Record<string, string> = {
  approved: '✅ Approved',
  changes_requested: '⚠️ Changes requested',
  comment: '💬 Comment',
};

/**
 * Send a revision notification to a Google Chat webhook URL.
 * Google Chat expects `{ text: string }` payload.
 */
export async function sendRevisionWebhook(
  webhookUrl: string,
  payload: RevisionPayload,
): Promise<boolean> {
  const statusLabel = STATUS_LABELS[payload.status] ?? payload.status;

  const text = [
    `${statusLabel} — *${payload.clientName}*`,
    ``,
    `*Post:* ${payload.postCaption.substring(0, 150)}${payload.postCaption.length > 150 ? '…' : ''}`,
    `*Reviewer:* ${payload.reviewerName}`,
    payload.comment ? `*Comment:* ${payload.comment}` : null,
    payload.postUrl ? `<${payload.postUrl}|View post>` : null,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`[revision-webhook] Failed to send (${res.status}):`, await res.text().catch(() => ''));
      return false;
    }

    console.log(`[revision-webhook] Sent to ${webhookUrl.substring(0, 40)}…`);
    return true;
  } catch (err) {
    console.error('[revision-webhook] Error:', err instanceof Error ? err.message : err);
    return false;
  }
}
