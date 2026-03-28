/**
 * Static ad image prompts — re-exports the single Gemini prompt builder.
 *
 * Canonical implementation: {@link buildGeminiStaticAdPrompt} in `gemini-static-ad-prompt.ts`.
 */
import {
  buildGeminiStaticAdPrompt,
  buildCleanCanvasPrompt,
  resolveBrandStyleAppendix,
  REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION,
  REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION_CLEAN_CANVAS,
  WIREFRAME_MULTIMODAL_INSTRUCTION_CLEAN_CANVAS,
  type BuildGeminiStaticAdPromptParams,
} from './gemini-static-ad-prompt';

export {
  buildGeminiStaticAdPrompt,
  buildCleanCanvasPrompt,
  resolveBrandStyleAppendix,
  REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION,
  REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION_CLEAN_CANVAS,
  WIREFRAME_MULTIMODAL_INSTRUCTION_CLEAN_CANVAS,
  type BuildGeminiStaticAdPromptParams,
};

/** @deprecated Prefer `buildGeminiStaticAdPrompt` — kept for existing import paths. */
export const assembleImagePrompt = buildGeminiStaticAdPrompt;
