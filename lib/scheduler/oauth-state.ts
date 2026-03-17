/**
 * Signed OAuth state tokens for the scheduler connect flow.
 *
 * Format: base64url(JSON payload).base64url(HMAC-SHA256 signature)
 * Secret: LATE_WEBHOOK_SECRET env var
 * Expiry: 10 minutes
 */

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export interface OAuthStatePayload {
  client_id: string;
  platform: string;
  ts: number;
}

function getSecret(): string {
  const secret = process.env.LATE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('LATE_WEBHOOK_SECRET is not set — cannot sign OAuth state');
  }
  return secret;
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : new Uint8Array(data);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  const secret = getSecret();
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Sign a state payload and return a token string: `base64url(payload).base64url(signature)`
 */
export async function signState(payload: OAuthStatePayload): Promise<string> {
  const key = await getHmacKey();
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadJson);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadB64),
  );
  const signatureB64 = base64UrlEncode(signature);
  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verify a signed state token. Returns the payload if valid, or throws on
 * invalid signature / expired token.
 */
export async function verifyState(token: string): Promise<OAuthStatePayload> {
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) {
    throw new Error('Invalid state token format');
  }

  const payloadB64 = token.slice(0, dotIndex);
  const signatureB64 = token.slice(dotIndex + 1);

  const key = await getHmacKey();
  const signatureBytes = base64UrlDecode(signatureB64);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes.buffer as ArrayBuffer,
    new TextEncoder().encode(payloadB64),
  );

  if (!valid) {
    throw new Error('Invalid state token signature');
  }

  const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
  const payload: OAuthStatePayload = JSON.parse(payloadJson);

  const age = Date.now() - payload.ts;
  if (age > STATE_MAX_AGE_MS || age < 0) {
    throw new Error('State token expired');
  }

  return payload;
}
