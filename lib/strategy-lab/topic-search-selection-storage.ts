/** Persists which topic search runs are included in a client Strategy lab session (browser-only). */
export const STRATEGY_LAB_TOPIC_SEARCH_SELECTION_PREFIX = 'strategy-lab:selected-topic-searches:';

export function strategyLabTopicSearchStorageKey(clientId: string): string {
  return `${STRATEGY_LAB_TOPIC_SEARCH_SELECTION_PREFIX}${clientId}`;
}

/**
 * Merges topic search IDs into the Strategy lab selection for `clientId` without removing existing pins.
 */
export function mergeTopicSearchSelectionIntoLocalStorage(clientId: string, ids: string[]): void {
  if (typeof window === 'undefined' || !clientId || ids.length === 0) return;
  try {
    const key = strategyLabTopicSearchStorageKey(clientId);
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const existing = new Set<string>(
      Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [],
    );
    for (const id of ids) existing.add(id);
    window.localStorage.setItem(key, JSON.stringify([...existing]));
  } catch {
    /* ignore quota / JSON */
  }
}
