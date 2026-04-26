import { OpenAiImageError, type OpenAiImageErrorCode } from './openai-image';

/**
 * Stable wire-format codes the chat UI switches on. We don't reuse the
 * internal `OpenAiImageErrorCode` strings directly because the UI shouldn't
 * care whether a key was missing locally vs. rejected upstream — only what
 * actionable instruction to surface to the operator.
 */
export type ImageErrorWireCode =
  | 'openai_key_missing'
  | 'openai_auth_failed'
  | 'openai_quota_exhausted'
  | 'openai_rate_limited'
  | 'openai_content_blocked'
  | 'openai_bad_request'
  | 'openai_timeout'
  | 'image_generation_failed'
  | 'unexpected_error';

interface MappedResponse {
  status: number;
  body: {
    error: string;
    code: ImageErrorWireCode;
    providerMessage?: string;
  };
}

const STATUS_BY_CODE: Record<OpenAiImageErrorCode, number> = {
  KEY_MISSING: 412,
  AUTH_FAILED: 401,
  QUOTA_EXHAUSTED: 402,
  RATE_LIMITED: 429,
  CONTENT_BLOCKED: 400,
  BAD_REQUEST: 400,
  TIMEOUT: 504,
  IMAGE_API_FAILED: 502,
};

const WIRE_BY_CODE: Record<OpenAiImageErrorCode, ImageErrorWireCode> = {
  KEY_MISSING: 'openai_key_missing',
  AUTH_FAILED: 'openai_auth_failed',
  QUOTA_EXHAUSTED: 'openai_quota_exhausted',
  RATE_LIMITED: 'openai_rate_limited',
  CONTENT_BLOCKED: 'openai_content_blocked',
  BAD_REQUEST: 'openai_bad_request',
  TIMEOUT: 'openai_timeout',
  IMAGE_API_FAILED: 'image_generation_failed',
};

export function mapImageErrorToResponse(err: unknown): MappedResponse {
  if (err instanceof OpenAiImageError) {
    return {
      status: STATUS_BY_CODE[err.code],
      body: {
        error: err.message,
        code: WIRE_BY_CODE[err.code],
        providerMessage: err.providerMessage ?? undefined,
      },
    };
  }
  const message =
    err instanceof Error && err.message
      ? err.message
      : 'Unexpected error generating ad concepts.';
  return {
    status: 500,
    body: { error: message, code: 'unexpected_error' },
  };
}
