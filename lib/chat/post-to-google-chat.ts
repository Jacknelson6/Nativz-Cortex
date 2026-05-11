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

/**
 * Google Chat message body. We send cardsV2-only messages (no `text`
 * field) because Chat renders the `text` as a separate plain-text
 * message above the card, which clutters the channel. The card header
 * doubles as the mobile notification + search preview.
 */
export interface ChatMessage {
  text?: string;
  cardsV2?: Array<{
    cardId: string;
    card: {
      header?: {
        title?: string;
        subtitle?: string;
        imageUrl?: string;
        imageType?: 'CIRCLE' | 'SQUARE';
      };
      sections?: Array<{
        header?: string;
        collapsible?: boolean;
        widgets: Array<Record<string, unknown>>;
      }>;
    };
  }>;
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

/**
 * Card-builder input. Lets every caller write a single high-level
 * object instead of hand-rolling the cardsV2 widget tree. The builder
 * always emits both a plain-text fallback (for mobile notifications
 * and Chat search previews) and a cardsV2 payload (for the rich-card
 * render in the team's space).
 *
 * Conventions Jack approved (2026-05-11):
 *   - emoji prefix on the title, e.g. "⏰ Avondale, expiring soon"
 *   - subtitle is the muted second line (client / project / context)
 *   - one paragraph per logical chunk; newlines inside a paragraph
 *     become <br>
 *   - buttons render as a single buttonList row at the bottom
 *   - quoted text inside paragraphs uses italic <i>...</i>, never the
 *     leading-`>` markdown form (which doesn't render in cards)
 */
export interface ChatCard {
  /** Stable per-card-type id used for cardsV2[].cardId. */
  cardId: string;
  /** Header title; include any emoji as the prefix. */
  title: string;
  /** Optional grey second line (client name, project, context). */
  subtitle?: string;
  /** Body sections; each becomes a textParagraph widget. Empty / null
   *  entries are dropped so callers can use `condition && string` inline.
   *
   *  Plain strings are HTML-escaped + newline-to-`<br>` converted, which
   *  is what 95% of callers want (anything user-typed goes here). For
   *  callers that need bold / italic / links inside agent-built copy,
   *  pass `{ html: '<b>Owner:</b> agency-owned' }` instead — it gets
   *  injected as-is. Never feed user input through the html escape
   *  hatch. */
  paragraphs: Array<string | { html: string } | null | false | undefined>;
  /** Optional buttons rendered in a single buttonList at the bottom. */
  buttons?: Array<{ text: string; url: string }>;
  /** Optional plain-text fallback. Kept on the type so callers can write
   *  one for documentation / future use, but it is no longer sent to
   *  Chat: the API renders `text` as a separate plain-text message
   *  above the card, which clutters channels. The card header doubles
   *  as the mobile-notification + search-preview line. */
  fallback?: string;
}

/** Light HTML escape for cardsV2 textParagraph content. Cards accept a
 *  very small HTML subset (<b>, <i>, <br>, <a href>); everything else
 *  should be escaped so user-supplied input can't break the layout or
 *  inject markup. Exported so callers building a `{ html }` paragraph
 *  with user-supplied text inside can escape it first.
 *
 *  Note: does NOT touch newlines. Use `escapeCardText` when you want
 *  newlines to become `<br>` too, which is the default behaviour for
 *  plain-string paragraphs. */
export function escapeCardHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Convert a paragraph string to cardsV2-safe HTML: escape, then turn
 *  newlines into <br> so callers don't have to think about it. */
function paragraphToHtml(raw: string): string {
  return escapeCardHtml(raw).replace(/\n/g, '<br>');
}

export function buildChatCardMessage(card: ChatCard): ChatMessage {
  const widgets: Array<Record<string, unknown>> = [];
  for (const p of card.paragraphs) {
    if (!p) continue;
    const text = typeof p === 'string' ? paragraphToHtml(p) : p.html;
    widgets.push({ textParagraph: { text } });
  }
  if (card.buttons && card.buttons.length > 0) {
    widgets.push({
      buttonList: {
        buttons: card.buttons.map((b) => ({
          text: b.text,
          onClick: { openLink: { url: b.url } },
        })),
      },
    });
  }
  return {
    cardsV2: [
      {
        cardId: card.cardId,
        card: {
          header: card.subtitle
            ? { title: card.title, subtitle: card.subtitle }
            : { title: card.title },
          sections: [{ widgets }],
        },
      },
    ],
  };
}
