import { createAdminClient } from '@/lib/supabase/admin';
import { extractAdPrompt } from './extract-prompt';

/**
 * Background worker that runs the vision pass on a freshly uploaded
 * pattern-library template. The POST upload route writes the row with
 * extraction_status='pending' and an empty prompt_schema, then fires
 * this off via `after()` so the HTTP response returns immediately
 * while Gemini does its 5-15s pass.
 *
 * On success: prompt_schema gets the structured JSON, extraction_status
 * flips to 'ready', extraction_error is cleared.
 * On failure: extraction_status flips to 'failed' with a one-line
 * extraction_error so the gallery can render a retry banner instead
 * of spinning forever.
 *
 * The vision call itself lives in extract-prompt.ts (already used by
 * the chat agent). Keeping that shape stable means the schema the
 * gallery card expects is identical to what every other code path
 * already consumes.
 */
export async function extractTemplateSchema(templateId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: template, error: loadError } = await admin
    .from('ad_prompt_templates')
    .select('id, reference_image_url, extraction_status')
    .eq('id', templateId)
    .maybeSingle();

  if (loadError || !template) {
    console.error('[extract-template] load failed', { templateId, loadError });
    return;
  }

  if (!template.reference_image_url) {
    await markFailed(templateId, 'Template has no reference image to analyze.');
    return;
  }

  try {
    const schema = await extractAdPrompt(template.reference_image_url);
    const { error: updateError } = await admin
      .from('ad_prompt_templates')
      .update({
        prompt_schema: schema,
        extraction_status: 'ready',
        extraction_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId);

    if (updateError) {
      console.error('[extract-template] update failed', { templateId, updateError });
      await markFailed(templateId, `Could not save extracted spec: ${updateError.message}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown extraction error';
    console.error('[extract-template] vision call failed', { templateId, message });
    await markFailed(templateId, message);
  }
}

async function markFailed(templateId: string, reason: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('ad_prompt_templates')
    .update({
      extraction_status: 'failed',
      extraction_error: reason.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId);
  if (error) {
    console.error('[extract-template] mark-failed failed', { templateId, error });
  }
}
