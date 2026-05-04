import { describe, expect, it } from 'vitest';
import {
  TOPIC_SEARCH_FOLDER_COLOR_CLASS,
  folderIconClass,
} from './topic-search-folders';

/**
 * topic-search-folders backs the folder-pill UI on /admin/research/topics.
 * One contract to pin:
 *
 *   folderIconClass falls back to the zinc class when the DB column carries
 *   anything we don't recognise. Old rows seeded before the palette was
 *   pinned (or hand-edited rows) need to render *something*; throwing or
 *   returning undefined here would crash the folder list with no visible
 *   error in production.
 */

describe('TOPIC_SEARCH_FOLDER_COLOR_CLASS', () => {
  it('exposes a fixed palette of six colors', () => {
    expect(Object.keys(TOPIC_SEARCH_FOLDER_COLOR_CLASS).sort()).toEqual([
      'amber',
      'blue',
      'green',
      'rose',
      'violet',
      'zinc',
    ]);
  });

  it('maps green -> emerald (intentional, not a typo)', () => {
    // The DB column says "green" but Tailwind's emerald reads better on the
    // dark surface. Pin that the mapping is deliberate, not a stale rename.
    expect(TOPIC_SEARCH_FOLDER_COLOR_CLASS.green).toBe('text-emerald-400');
  });
});

describe('folderIconClass', () => {
  it('returns the matching tailwind class for a known color', () => {
    expect(folderIconClass('blue')).toBe('text-blue-400');
    expect(folderIconClass('rose')).toBe('text-rose-400');
    expect(folderIconClass('violet')).toBe('text-violet-400');
  });

  it('falls back to the zinc class for unknown colors', () => {
    expect(folderIconClass('chartreuse')).toBe('text-zinc-400');
  });

  it('falls back to the zinc class for empty string', () => {
    expect(folderIconClass('')).toBe('text-zinc-400');
  });

  it('is case-sensitive (uppercase does NOT match)', () => {
    // Pinning current behaviour — DB column is always lowercase, so an
    // uppercase value here is a data bug we want to surface as the zinc
    // fallback rather than silently match.
    expect(folderIconClass('BLUE')).toBe('text-zinc-400');
  });
});
