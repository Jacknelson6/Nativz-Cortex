import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/client', () => ({
  createCompletion: vi.fn(),
}));

import { summarizeRevisionEdits } from './summarize-revisions';
import { createCompletion } from '@/lib/ai/client';

const mockCreateCompletion = vi.mocked(createCompletion);
const FALLBACK = ['We took care of all of your requested revisions.'];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('summarizeRevisionEdits', () => {
  it('returns [] (no fallback) when input is empty', async () => {
    expect(await summarizeRevisionEdits([])).toEqual([]);
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it('returns [] when input is all whitespace / empty strings', async () => {
    expect(await summarizeRevisionEdits(['', '   ', '\n\t'])).toEqual([]);
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it('returns parsed bullets on a clean JSON response', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: JSON.stringify({
        bullets: ['Removed shaky intro clip', 'Tightened pacing on b-roll'],
      }),
    } as Awaited<ReturnType<typeof createCompletion>>);

    const result = await summarizeRevisionEdits([
      'intro is shaky',
      'pacing drags in the middle',
    ]);
    expect(result).toEqual([
      'Removed shaky intro clip',
      'Tightened pacing on b-roll',
    ]);
  });

  it('numbers and forwards the reviewer notes to the AI prompt', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: JSON.stringify({ bullets: ['Did the thing'] }),
    } as Awaited<ReturnType<typeof createCompletion>>);

    await summarizeRevisionEdits(['note A', 'note B', 'note C']);
    const arg = mockCreateCompletion.mock.calls[0]![0] as {
      messages: { role: string; content: string }[];
    };
    const userPrompt = arg.messages.find((m) => m.role === 'user')!.content;
    expect(userPrompt).toContain('1. note A');
    expect(userPrompt).toContain('2. note B');
    expect(userPrompt).toContain('3. note C');
  });

  it('trims whitespace from notes before forwarding', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: JSON.stringify({ bullets: ['x'] }),
    } as Awaited<ReturnType<typeof createCompletion>>);

    await summarizeRevisionEdits(['   trimmed note   ', '\nanother\n']);
    const arg = mockCreateCompletion.mock.calls[0]![0] as {
      messages: { role: string; content: string }[];
    };
    const userPrompt = arg.messages.find((m) => m.role === 'user')!.content;
    expect(userPrompt).toContain('1. trimmed note');
    expect(userPrompt).toContain('2. another');
    expect(userPrompt).not.toContain('   trimmed');
  });

  it('caps bullets at MAX_BULLETS (8) even if the model returns more', async () => {
    const tenBullets = Array.from({ length: 10 }, (_, i) => `Bullet ${i + 1}`);
    mockCreateCompletion.mockResolvedValueOnce({
      text: JSON.stringify({ bullets: tenBullets }),
    } as Awaited<ReturnType<typeof createCompletion>>);

    const result = await summarizeRevisionEdits(['some note']);
    expect(result).toHaveLength(8);
    expect(result).toEqual(tenBullets.slice(0, 8));
  });

  it('filters out non-string bullets and trims survivors', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: JSON.stringify({
        bullets: ['  Cut the long pause  ', 42, null, '', 'Updated logo'],
      }),
    } as Awaited<ReturnType<typeof createCompletion>>);

    const result = await summarizeRevisionEdits(['note']);
    expect(result).toEqual(['Cut the long pause', 'Updated logo']);
  });

  it('parses JSON wrapped in ```json fences', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: '```json\n{"bullets": ["Re-cut clip"]}\n```',
    } as Awaited<ReturnType<typeof createCompletion>>);

    const result = await summarizeRevisionEdits(['note']);
    expect(result).toEqual(['Re-cut clip']);
  });

  it('parses JSON wrapped in plain ``` fences (no language tag)', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: '```\n{"bullets": ["Trimmed intro"]}\n```',
    } as Awaited<ReturnType<typeof createCompletion>>);

    const result = await summarizeRevisionEdits(['note']);
    expect(result).toEqual(['Trimmed intro']);
  });

  it('returns fallback when model returns empty text', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: '',
    } as Awaited<ReturnType<typeof createCompletion>>);

    expect(await summarizeRevisionEdits(['note'])).toEqual(FALLBACK);
  });

  it('returns fallback when model returns whitespace-only text', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: '   \n\t  ',
    } as Awaited<ReturnType<typeof createCompletion>>);

    expect(await summarizeRevisionEdits(['note'])).toEqual(FALLBACK);
  });

  it('returns fallback on unparseable garbage (no fences either)', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: 'this is not JSON at all',
    } as Awaited<ReturnType<typeof createCompletion>>);

    expect(await summarizeRevisionEdits(['note'])).toEqual(FALLBACK);
  });

  it('returns fallback when fenced content is itself invalid JSON', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: '```json\nnot json inside fence\n```',
    } as Awaited<ReturnType<typeof createCompletion>>);

    expect(await summarizeRevisionEdits(['note'])).toEqual(FALLBACK);
  });

  it('returns fallback when bullets is not an array', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: JSON.stringify({ bullets: 'not an array' }),
    } as Awaited<ReturnType<typeof createCompletion>>);

    expect(await summarizeRevisionEdits(['note'])).toEqual(FALLBACK);
  });

  it('returns fallback when bullets key is missing entirely', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: JSON.stringify({ summary: 'wrong key shape' }),
    } as Awaited<ReturnType<typeof createCompletion>>);

    expect(await summarizeRevisionEdits(['note'])).toEqual(FALLBACK);
  });

  it('returns fallback when bullets is array but every entry is empty/non-string', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: JSON.stringify({ bullets: ['', '   ', null, 5] }),
    } as Awaited<ReturnType<typeof createCompletion>>);

    expect(await summarizeRevisionEdits(['note'])).toEqual(FALLBACK);
  });

  it('returns fallback when createCompletion throws', async () => {
    mockCreateCompletion.mockRejectedValueOnce(new Error('AI is down'));
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await summarizeRevisionEdits(['note'])).toEqual(FALLBACK);
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it('forwards expected createCompletion options (maxTokens, jsonMode, feature)', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      text: JSON.stringify({ bullets: ['x'] }),
    } as Awaited<ReturnType<typeof createCompletion>>);

    await summarizeRevisionEdits(['note']);
    const arg = mockCreateCompletion.mock.calls[0]![0] as {
      maxTokens: number;
      jsonMode: boolean;
      feature: string;
    };
    expect(arg.maxTokens).toBe(600);
    expect(arg.jsonMode).toBe(true);
    expect(arg.feature).toBe('calendar_revised_videos_summary');
  });
});
