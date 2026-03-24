import { describe, expect, it } from 'vitest';
import { filterCriticalConsoleErrors, isBenignConsoleMessage } from './e2e-helpers';

describe('e2e-helpers — console noise filter', () => {
  it('treats known benign dev/browser messages as non-critical', () => {
    expect(isBenignConsoleMessage('Failed to load resource: favicon.ico')).toBe(true);
    expect(isBenignConsoleMessage('ResizeObserver loop limit exceeded')).toBe(true);
    expect(isBenignConsoleMessage('Warning: useLayoutEffect')).toBe(true);
    expect(isBenignConsoleMessage('deprecated API')).toBe(true);
    expect(isBenignConsoleMessage("Cannot read properties of null (reading 'blendFunc')")).toBe(true);
    expect(
      isBenignConsoleMessage("Module parse failed: Identifier 'x' has already been declared"),
    ).toBe(true);
  });

  it('keeps likely real application errors', () => {
    expect(isBenignConsoleMessage('TypeError: undefined is not a function')).toBe(false);
    expect(isBenignConsoleMessage('Failed to load todo widget data')).toBe(false);
    expect(isBenignConsoleMessage('ChunkLoadError')).toBe(false);
  });

  it('filterCriticalConsoleErrors strips only benign lines', () => {
    const raw = [
      'GET favicon.ico 404',
      'TypeError: boom',
      'ResizeObserver loop',
    ];
    expect(filterCriticalConsoleErrors(raw)).toEqual(['TypeError: boom']);
  });
});
