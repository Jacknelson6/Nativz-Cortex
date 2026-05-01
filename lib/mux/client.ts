import Mux from '@mux/mux-node';

/**
 * Server-side Mux SDK singleton.
 *
 * Reads `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` from the environment by default,
 * so we just construct it. We pass them explicitly so it fails loudly at boot
 * if either var is missing in this deploy.
 *
 * Use this on the server only — it carries the secret. Never import from a
 * client component.
 */
let _mux: Mux | null = null;

export function getMux(): Mux {
  if (_mux) return _mux;
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error(
      'Video upload is temporarily unavailable. Please try again in a moment, and ping the team if it keeps failing.',
    );
  }
  _mux = new Mux({
    tokenId,
    tokenSecret,
    // webhookSecret picked up from MUX_WEBHOOK_SECRET if present.
  });
  return _mux;
}

/**
 * Coarse status the UI cares about. We mirror Mux's lifecycle into a small
 * enum so the share page can switch on a single string.
 */
export type MuxStatus = 'pending' | 'uploading' | 'processing' | 'ready' | 'errored';
