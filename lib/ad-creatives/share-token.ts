import { randomBytes } from 'crypto';

/**
 * Generate a URL-safe opaque share token. 32 bytes of randomness base64url
 * encoded gives us ~43 characters and 2^256 entropy — not enumerable in any
 * practical sense, even without hashing at rest. If we later decide to hash
 * tokens in the DB (defense against a stolen backup surfacing live links),
 * this is the single place callers need to understand.
 */
export function generateShareToken(): string {
  return randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface ShareTokenRow {
  id: string;
  token: string;
  batch_id: string | null;
  client_id: string;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export type ShareTokenStatus =
  | { ok: true; token: ShareTokenRow }
  | { ok: false; reason: 'not-found' | 'revoked' | 'expired' };

/**
 * Validate a share token is live. Used by every public share-link API
 * route — kept here so the policy (revoked > expired > not-found) is
 * consistent across endpoints.
 */
export function evaluateShareToken(
  token: ShareTokenRow | null | undefined,
): ShareTokenStatus {
  if (!token) return { ok: false, reason: 'not-found' };
  if (token.revoked_at) return { ok: false, reason: 'revoked' };
  if (token.expires_at && new Date(token.expires_at) < new Date()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, token };
}
