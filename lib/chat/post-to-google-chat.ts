/**
 * Google Chat incoming-webhook poster.
 *
 * Webhook URL format:
 *   https://chat.googleapis.com/v1/spaces/{SPACE}/messages?key=...&token=...
 *
 * We post Card V2 messages by default (richer layout for change-requests,
 * comments, approvals, etc.). `text` is still supported for plain pings
 * and as a fallback string on cards so notification mirrors (email digest,
 * etc.) get a sensible non-card representation.
 */

const CHAT_WEBHOOK_PREFIX = 'https://chat.googleapis.com/';

export function isGoogleChatWebhook(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith(CHAT_WEBHOOK_PREFIX);
}

// ---------------------------------------------------------------------------
// Card V2 builder
// ---------------------------------------------------------------------------

export type ChatCardWidget =
  | { type: 'text'; text: string }
  | { type: 'quote'; text: string; label?: string }
  | { type: 'kv'; label: string; value: string; bottomLabel?: string }
  | { type: 'button'; text: string; url: string; filled?: boolean }
  | {
      type: 'buttons';
      buttons: Array<{ text: string; url: string; filled?: boolean }>;
    }
  | { type: 'divider' };

export interface ChatCardSection {
  header?: string;
  widgets: ChatCardWidget[];
}

export interface ChatCardInput {
  /** Stable id so Chat de-dupes accidental retries of the same card. */
  cardId: string;
  headerTitle: string;
  headerSubtitle?: string;
  /** Optional avatar/icon image (square). */
  headerImageUrl?: string;
  sections: ChatCardSection[];
  /** Plain-text fallback shown on devices that don't render cards. */
  fallbackText?: string;
}

interface CardV2TextWidget {
  textParagraph: { text: string };
}
interface CardV2DecoratedTextWidget {
  decoratedText: {
    topLabel?: string;
    text: string;
    bottomLabel?: string;
    wrapText?: boolean;
  };
}
interface CardV2ButtonListWidget {
  buttonList: {
    buttons: Array<{
      text: string;
      onClick: { openLink: { url: string } };
      color?: { red: number; green: number; blue: number; alpha?: number };
      type?: 'OUTLINED' | 'FILLED' | 'BORDERLESS';
    }>;
  };
}
interface CardV2DividerWidget {
  divider: Record<string, never>;
}

type CardV2Widget =
  | CardV2TextWidget
  | CardV2DecoratedTextWidget
  | CardV2ButtonListWidget
  | CardV2DividerWidget;

interface CardV2Section {
  header?: string;
  collapsible?: boolean;
  widgets: CardV2Widget[];
}

interface CardV2 {
  cardId: string;
  card: {
    header?: {
      title: string;
      subtitle?: string;
      imageUrl?: string;
      imageType?: 'CIRCLE' | 'SQUARE';
    };
    sections: CardV2Section[];
  };
}

export interface ChatMessage {
  text?: string;
  cardsV2?: CardV2[];
}

/**
 * HTML-escape for textParagraph bodies. Card V2 textParagraph allows a
 * limited HTML subset (<b>, <i>, <a href=...>, <br>, <font color>, etc.)
 * so we only escape the destructive chars and leave whitespace alone.
 */
function escapeForCard(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function widgetToCardV2(widget: ChatCardWidget): CardV2Widget | null {
  switch (widget.type) {
    case 'text':
      return { textParagraph: { text: widget.text } };
    case 'quote': {
      // Render as a label + italic body block. Card V2 textParagraph supports
      // <b>/<i>/<br>, so we line-break the quote and italicise it for the
      // "blockquote" feel.
      const lines = widget.text.split('\n').map(escapeForCard).join('<br>');
      const body = `<i>${lines}</i>`;
      return widget.label
        ? {
            decoratedText: {
              topLabel: widget.label,
              text: body,
              wrapText: true,
            },
          }
        : { textParagraph: { text: body } };
    }
    case 'kv':
      return {
        decoratedText: {
          topLabel: widget.label,
          text: widget.value,
          bottomLabel: widget.bottomLabel,
          wrapText: true,
        },
      };
    case 'button':
      return {
        buttonList: {
          buttons: [
            {
              text: widget.text,
              onClick: { openLink: { url: widget.url } },
              ...(widget.filled
                ? { type: 'FILLED' as const }
                : { type: 'OUTLINED' as const }),
            },
          ],
        },
      };
    case 'buttons':
      return {
        buttonList: {
          buttons: widget.buttons.map((b) => ({
            text: b.text,
            onClick: { openLink: { url: b.url } },
            ...(b.filled
              ? { type: 'FILLED' as const }
              : { type: 'OUTLINED' as const }),
          })),
        },
      };
    case 'divider':
      return { divider: {} };
    default: {
      const _exhaustive: never = widget;
      void _exhaustive;
      return null;
    }
  }
}

export function buildChatCard(input: ChatCardInput): ChatMessage {
  const sections: CardV2Section[] = input.sections.map((s) => ({
    ...(s.header ? { header: s.header } : {}),
    widgets: s.widgets
      .map(widgetToCardV2)
      .filter((w): w is CardV2Widget => w !== null),
  }));

  const card: CardV2 = {
    cardId: input.cardId,
    card: {
      ...(input.headerTitle || input.headerSubtitle || input.headerImageUrl
        ? {
            header: {
              title: input.headerTitle,
              ...(input.headerSubtitle
                ? { subtitle: input.headerSubtitle }
                : {}),
              ...(input.headerImageUrl
                ? {
                    imageUrl: input.headerImageUrl,
                    imageType: 'CIRCLE' as const,
                  }
                : {}),
            },
          }
        : {}),
      sections,
    },
  };

  // Card V2 only — no `text` sibling. Google Chat renders a payload with
  // both `text` and `cardsV2` as two separate message bubbles, which is
  // why the team kept seeing a plain-text duplicate above each card.
  // `fallbackText` is accepted on the input for backwards compatibility
  // but is intentionally dropped from the wire payload.
  return { cardsV2: [card] };
}

// ---------------------------------------------------------------------------
// Posters
// ---------------------------------------------------------------------------

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
    console.error(
      `[google-chat] post failed${context ? ` (${context})` : ''}:`,
      err,
    );
  });
}

// ---------------------------------------------------------------------------
// Simpler paragraph-based builder (alternative API to buildChatCard).
//
// Some call sites (cron digests, expiry watches, ad-creative notifies) read
// more naturally as "title + a few paragraphs + buttons" than as a widget
// tree. `buildChatCardMessage` accepts a flat ChatCard shape, escapes user
// content, supports an `{ html }` escape hatch for agent-built markup, and
// renders the same cardsV2 underneath. Either builder is fine; pick whichever
// reads cleaner at the call site.
// ---------------------------------------------------------------------------

export interface ChatCard {
  cardId: string;
  title: string;
  subtitle?: string;
  paragraphs: Array<string | { html: string } | null | false | undefined>;
  buttons?: Array<{ text: string; url: string }>;
  fallback?: string;
}

export function escapeCardHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function paragraphToHtml(raw: string): string {
  return escapeCardHtml(raw).replace(/\n/g, '<br>');
}

export function buildChatCardMessage(card: ChatCard): ChatMessage {
  const widgets: CardV2Widget[] = [];
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
