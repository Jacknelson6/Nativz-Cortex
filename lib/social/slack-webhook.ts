/**
 * Generic Slack incoming-webhook poster used by ops-side notifiers
 * (CUP-02 SMM review dispatcher + future ops channels).
 *
 * Contract: never throws. Returns { ok, error? } so callers can chain
 * this alongside the in-app notification write without try/catch boilerplate
 * at every call site.
 */

export type SlackBlock =
  | { type: 'section'; text: { type: 'mrkdwn' | 'plain_text'; text: string } }
  | { type: 'divider' }
  | {
      type: 'actions';
      elements: Array<{
        type: 'button';
        text: { type: 'plain_text'; text: string };
        url?: string;
        value?: string;
        style?: 'primary' | 'danger';
      }>;
    };

export interface PostOpsSlackInput {
  webhookUrl: string;
  text: string;
  blocks?: SlackBlock[];
}

export interface PostOpsSlackResult {
  ok: boolean;
  error?: string;
}

const TIMEOUT_MS = 5_000;

export async function postOpsSlack(
  input: PostOpsSlackInput,
): Promise<PostOpsSlackResult> {
  if (!input.webhookUrl) {
    return { ok: false, error: 'missing webhook url' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(input.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: input.text,
        ...(input.blocks ? { blocks: input.blocks } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `slack ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
