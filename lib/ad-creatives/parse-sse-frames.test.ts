import { describe, it, expect } from 'vitest';
import { parseSseFrames } from './parse-sse-frames';

describe('parseSseFrames', () => {
  it('parses a single complete LF-delimited frame', () => {
    const { events, rest } = parseSseFrames<{ type: string }>(
      'data: {"type":"agent_started"}\n\n',
    );
    expect(events).toEqual([{ type: 'agent_started' }]);
    expect(rest).toBe('');
  });

  it('parses CRLF-delimited frames (proxies that rewrite line endings)', () => {
    const { events, rest } = parseSseFrames<{ type: string }>(
      'data: {"type":"agent_started"}\r\n\r\n',
    );
    expect(events).toEqual([{ type: 'agent_started' }]);
    expect(rest).toBe('');
  });

  it('returns the trailing partial frame as `rest`', () => {
    const { events, rest } = parseSseFrames<{ type: string }>(
      'data: {"type":"agent_started"}\n\ndata: {"type":"tool_st',
    );
    expect(events).toEqual([{ type: 'agent_started' }]);
    expect(rest).toBe('data: {"type":"tool_st');
  });

  it('parses multiple frames in one buffer', () => {
    const buf =
      'data: {"type":"a"}\n\ndata: {"type":"b"}\n\ndata: {"type":"c"}\n\n';
    const { events, rest } = parseSseFrames<{ type: string }>(buf);
    expect(events.map((e) => e.type)).toEqual(['a', 'b', 'c']);
    expect(rest).toBe('');
  });

  it('skips malformed JSON without breaking the stream', () => {
    const buf =
      'data: {"type":"good"}\n\ndata: not-json\n\ndata: {"type":"also_good"}\n\n';
    const { events } = parseSseFrames<{ type: string }>(buf);
    expect(events.map((e) => e.type)).toEqual(['good', 'also_good']);
  });

  it('ignores frames without a data: line (comments, retries)', () => {
    const buf = ': keep-alive\n\ndata: {"type":"real"}\n\n';
    const { events } = parseSseFrames<{ type: string }>(buf);
    expect(events).toEqual([{ type: 'real' }]);
  });

  it('handles mixed LF and CRLF delimiters in one buffer', () => {
    const buf = 'data: {"type":"a"}\n\ndata: {"type":"b"}\r\n\r\n';
    const { events, rest } = parseSseFrames<{ type: string }>(buf);
    expect(events.map((e) => e.type)).toEqual(['a', 'b']);
    expect(rest).toBe('');
  });

  it('returns empty events when no terminator is present', () => {
    const { events, rest } = parseSseFrames(
      'data: {"type":"partial_only"}',
    );
    expect(events).toEqual([]);
    expect(rest).toBe('data: {"type":"partial_only"}');
  });
});
