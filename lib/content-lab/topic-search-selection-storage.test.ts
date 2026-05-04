// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STRATEGY_LAB_TOPIC_SEARCH_SELECTION_PREFIX,
  contentLabTopicSearchStorageKey,
  mergeTopicSearchSelectionIntoLocalStorage,
} from './topic-search-selection-storage';

/**
 * topic-search-selection-storage backs the "pinned topic searches" panel
 * in Strategy lab. It's browser-only and lives in localStorage. Three
 * contracts to pin:
 *
 *   1. The merge is additive, never destructive. If the user has already
 *      pinned [a, b] and we merge in [b, c], the result must be [a, b, c]
 *      with `b` deduped. A regression that overwrote on merge would make
 *      "Add to lab" silently drop the user's previous pins from another
 *      tab.
 *
 *   2. Quota / JSON / corrupt-string failures are swallowed silently. The
 *      storage helper is fire-and-forget from the UI; throwing here would
 *      bubble into the topic-search row click handler and break navigation
 *      on private-mode browsers.
 *
 *   3. The key is namespaced per client (`...:<clientId>`). Two clients
 *      sharing the same browser must not stomp on each other's pinned
 *      lists; a missing namespace would cross-contaminate strategy
 *      sessions.
 */

const clientA = 'client-a';
const clientB = 'client-b';
const keyA = `${STRATEGY_LAB_TOPIC_SEARCH_SELECTION_PREFIX}${clientA}`;
const keyB = `${STRATEGY_LAB_TOPIC_SEARCH_SELECTION_PREFIX}${clientB}`;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('contentLabTopicSearchStorageKey', () => {
  it('namespaces the key with the client id', () => {
    expect(contentLabTopicSearchStorageKey(clientA)).toBe(keyA);
    expect(contentLabTopicSearchStorageKey(clientB)).toBe(keyB);
    expect(keyA).not.toBe(keyB);
  });
});

describe('mergeTopicSearchSelectionIntoLocalStorage — happy path', () => {
  it('writes a fresh array when no entry exists yet', () => {
    mergeTopicSearchSelectionIntoLocalStorage(clientA, ['s1', 's2']);
    expect(JSON.parse(window.localStorage.getItem(keyA) ?? 'null')).toEqual([
      's1',
      's2',
    ]);
  });

  it('merges new ids onto an existing list (additive, not destructive)', () => {
    window.localStorage.setItem(keyA, JSON.stringify(['s1', 's2']));
    mergeTopicSearchSelectionIntoLocalStorage(clientA, ['s2', 's3']);
    const out = JSON.parse(window.localStorage.getItem(keyA) ?? 'null') as string[];
    expect(out.sort()).toEqual(['s1', 's2', 's3']);
  });

  it('dedupes ids already present', () => {
    window.localStorage.setItem(keyA, JSON.stringify(['s1']));
    mergeTopicSearchSelectionIntoLocalStorage(clientA, ['s1', 's1', 's1']);
    expect(JSON.parse(window.localStorage.getItem(keyA) ?? 'null')).toEqual(['s1']);
  });

  it('does not cross-contaminate two clients in the same browser', () => {
    mergeTopicSearchSelectionIntoLocalStorage(clientA, ['s1']);
    mergeTopicSearchSelectionIntoLocalStorage(clientB, ['s9']);
    expect(JSON.parse(window.localStorage.getItem(keyA) ?? 'null')).toEqual(['s1']);
    expect(JSON.parse(window.localStorage.getItem(keyB) ?? 'null')).toEqual(['s9']);
  });
});

describe('mergeTopicSearchSelectionIntoLocalStorage — no-op guards', () => {
  it('is a no-op when ids is empty (does not even create the key)', () => {
    mergeTopicSearchSelectionIntoLocalStorage(clientA, []);
    expect(window.localStorage.getItem(keyA)).toBeNull();
  });

  it('is a no-op when clientId is empty (would otherwise namespace to "")', () => {
    mergeTopicSearchSelectionIntoLocalStorage('', ['s1']);
    expect(
      window.localStorage.getItem(`${STRATEGY_LAB_TOPIC_SEARCH_SELECTION_PREFIX}`),
    ).toBeNull();
  });
});

describe('mergeTopicSearchSelectionIntoLocalStorage — fault tolerance', () => {
  it('swallows corrupt JSON in the existing value (no throw, fail-safe)', () => {
    // The whole merge is wrapped in try/catch so a JSON.parse failure
    // bails BEFORE the setItem write. The corrupt blob is left in place
    // rather than being replaced — pinning current behaviour because
    // overwriting unparseable storage from a navigation handler would
    // mask a real bug somewhere upstream.
    window.localStorage.setItem(keyA, 'not-json{');
    expect(() =>
      mergeTopicSearchSelectionIntoLocalStorage(clientA, ['s1']),
    ).not.toThrow();
    expect(window.localStorage.getItem(keyA)).toBe('not-json{');
  });

  it('drops non-string entries from a malformed existing list', () => {
    // Older UI versions may have written mixed payloads; only string ids are
    // valid topic-search-run identifiers.
    window.localStorage.setItem(keyA, JSON.stringify(['s1', 42, null, 's2']));
    mergeTopicSearchSelectionIntoLocalStorage(clientA, ['s3']);
    const out = JSON.parse(window.localStorage.getItem(keyA) ?? 'null') as string[];
    expect(out.sort()).toEqual(['s1', 's2', 's3']);
  });

  it('treats a non-array JSON value as an empty list', () => {
    window.localStorage.setItem(keyA, JSON.stringify({ unexpected: 'shape' }));
    mergeTopicSearchSelectionIntoLocalStorage(clientA, ['s1']);
    expect(JSON.parse(window.localStorage.getItem(keyA) ?? 'null')).toEqual(['s1']);
  });

  it('swallows setItem quota errors instead of throwing', () => {
    window.localStorage.setItem(keyA, JSON.stringify(['s1']));
    const setSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    expect(() =>
      mergeTopicSearchSelectionIntoLocalStorage(clientA, ['s2']),
    ).not.toThrow();
    setSpy.mockRestore();
  });
});
