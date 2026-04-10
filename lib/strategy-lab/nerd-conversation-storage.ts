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

export const STRATEGY_LAB_NERD_CONVERSATION_PREFIX = 'strategy-lab:nerd-conversation:';

export function strategyLabNerdConversationKey(clientId: string): string {
  return `${STRATEGY_LAB_NERD_CONVERSATION_PREFIX}${clientId}`;
}

export function readStrategyLabNerdConversationId(clientId: string): string | null {
  if (typeof window === 'undefined' || !clientId) return null;
  try {
    const raw = window.localStorage.getItem(strategyLabNerdConversationKey(clientId));
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function writeStrategyLabNerdConversationId(clientId: string, conversationId: string): void {
  if (typeof window === 'undefined' || !clientId || !conversationId) return;
  try {
    window.localStorage.setItem(strategyLabNerdConversationKey(clientId), conversationId);
  } catch {
    /* ignore quota */
  }
}

export function clearStrategyLabNerdConversationId(clientId: string): void {
  if (typeof window === 'undefined' || !clientId) return;
  try {
    window.localStorage.removeItem(strategyLabNerdConversationKey(clientId));
  } catch {
    /* ignore */
  }
}
