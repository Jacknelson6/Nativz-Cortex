import { describe, it, expect, beforeEach, vi } from 'vitest';
import { postOpsSlack } from './slack-webhook';

const URL = 'https://hooks.slack.com/services/T/B/abc';

describe('postOpsSlack', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok:true on 200 and posts the expected payload shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await postOpsSlack({
      webhookUrl: URL,
      text: 'awaiting smm review',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '*nike* drop ready' } },
        { type: 'divider' },
      ],
    });

    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body as string);
    expect(body.text).toBe('awaiting smm review');
    expect(body.blocks).toHaveLength(2);
    expect(body.blocks[0].type).toBe('section');
  });

  it('omits blocks from the payload when none are passed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await postOpsSlack({ webhookUrl: URL, text: 'plain' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toBe('plain');
    expect('blocks' in body).toBe(false);
  });

  it('returns ok:false with status on non-2xx', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('invalid_token', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await postOpsSlack({ webhookUrl: URL, text: 'x' });

    expect(out.ok).toBe(false);
    expect(out.error).toContain('401');
    expect(out.error).toContain('invalid_token');
  });

  it('returns ok:false instead of throwing when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    vi.stubGlobal('fetch', fetchMock);

    const out = await postOpsSlack({ webhookUrl: URL, text: 'x' });

    expect(out.ok).toBe(false);
    expect(out.error).toBe('ECONNRESET');
  });

  it('refuses an empty webhook url without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const out = await postOpsSlack({ webhookUrl: '', text: 'x' });

    expect(out).toEqual({ ok: false, error: 'missing webhook url' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
