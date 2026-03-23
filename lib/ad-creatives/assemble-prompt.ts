/**
 * Static ad image prompts — re-exports the single Gemini prompt builder.
 *
 * Canonical implementation: {@link buildGeminiStaticAdPrompt} in `gemini-static-ad-prompt.ts`.
 */
import {
  buildGeminiStaticAdPrompt,
  resolveBrandStyleAppendix,
  REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION,
  type BuildGeminiStaticAdPromptParams,
} from './gemini-static-ad-prompt';

export {
  buildGeminiStaticAdPrompt,
  resolveBrandStyleAppendix,
  REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION,
  type BuildGeminiStaticAdPromptParams,
};

/** @deprecated Prefer `buildGeminiStaticAdPrompt` — kept for existing import paths. */
export const assembleImagePrompt = buildGeminiStaticAdPrompt;
