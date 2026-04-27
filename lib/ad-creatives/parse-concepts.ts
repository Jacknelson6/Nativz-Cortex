/**
 * Pure JSON-with-fences extractor for the agent's `compose_concepts` tool
 * output. Lives in its own module so unit tests can import it without
 * dragging in Supabase / OpenAI / OpenRouter SDKs.
 */
export interface RawConcept {
  reference_ad_id?: unknown;
  template_name?: unknown;
  headline?: unknown;
  body_copy?: unknown;
  visual_description?: unknown;
  source_grounding?: unknown;
  image_prompt?: unknown;
}

export function parseConcepts(raw: string): RawConcept[] {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (Array.isArray(parsed)) return parsed as RawConcept[];
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { concepts?: unknown }).concepts)
    ) {
      return (parsed as { concepts: RawConcept[] }).concepts;
    }
  } catch {
    return [];
  }
  return [];
}
