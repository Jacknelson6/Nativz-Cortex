/**
 * Client-side persistence of the Strategy Lab Nerd conversation ID per client.
 *
 * Each client has one "current" Strategy Lab chat — when the user reopens the
 * lab for the same client, we resume the same conversation instead of starting
 * fresh. The conversation itself lives in `nerd_conversations` / `nerd_messages`
 * (server-owned). This file only tracks the pointer in localStorage.
 *
 * Parallel to `topic-search-selection-storage.ts`; same key-per-client pattern.
 */

export const STRATEGY_LAB_NERD_CONVERSATION_PREFIX = 'content-lab:nerd-conversation:';
/** Sentinel used for the no-client (general) Strategy Lab chat. */
export const STRATEGY_LAB_GENERAL_KEY = 'content-lab:nerd-conversation:__general__';

export function readGeneralContentLabConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STRATEGY_LAB_GENERAL_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function writeGeneralContentLabConversationId(id: string): void {
  if (typeof window === 'undefined' || !id) return;
  try {
    window.localStorage.setItem(STRATEGY_LAB_GENERAL_KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearGeneralContentLabConversationId(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STRATEGY_LAB_GENERAL_KEY);
  } catch {
    /* ignore */
  }
}

export function contentLabNerdConversationKey(clientId: string): string {
  return `${STRATEGY_LAB_NERD_CONVERSATION_PREFIX}${clientId}`;
}

export function readContentLabNerdConversationId(clientId: string): string | null {
  if (typeof window === 'undefined' || !clientId) return null;
  try {
    const raw = window.localStorage.getItem(contentLabNerdConversationKey(clientId));
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function writeContentLabNerdConversationId(clientId: string, conversationId: string): void {
  if (typeof window === 'undefined' || !clientId || !conversationId) return;
  try {
    window.localStorage.setItem(contentLabNerdConversationKey(clientId), conversationId);
  } catch {
    /* ignore quota */
  }
}

export function clearContentLabNerdConversationId(clientId: string): void {
  if (typeof window === 'undefined' || !clientId) return;
  try {
    window.localStorage.removeItem(contentLabNerdConversationKey(clientId));
  } catch {
    /* ignore */
  }
}
