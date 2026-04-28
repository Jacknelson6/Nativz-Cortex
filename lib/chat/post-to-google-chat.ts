/**
 * Google Chat incoming-webhook poster.
 *
 * Webhook URL format:
 *   https://chat.googleapis.com/v1/spaces/{SPACE}/messages?key=...&token=...
 *
 * Used by app/api/calendar/share/[token]/comment/route.ts and the daily
 * digest cron — fire-and-forget; we never block the user-facing path on
 * Google Chat being available.
 */

const CHAT_WEBHOOK_PREFIX = 'https://chat.googleapis.com/';

export function isGoogleChatWebhook(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith(CHAT_WEBHOOK_PREFIX);
}

export interface ChatMessage {
  text: string;
}

export async function postToGoogleChat(
  webhookUrl: string,
  message: ChatMessage,
): Promise<void> {
  if (!isGoogleChatWebhook(webhookUrl)) {
    throw new Error('Invalid Google Chat webhook URL');
  }
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Chat webhook ${res.status}: ${body.slice(0, 300)}`);
  }
}

export function postToGoogleChatSafe(
  webhookUrl: string | null | undefined,
  message: ChatMessage,
  context?: string,
): void {
  if (!webhookUrl) return;
  postToGoogleChat(webhookUrl, message).catch((err) => {
    console.error(`[google-chat] post failed${context ? ` (${context})` : ''}:`, err);
  });
}
