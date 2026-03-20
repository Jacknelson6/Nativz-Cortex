import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandContext } from '@/lib/knowledge/brand-context';
import { assembleImagePrompt } from '@/lib/ad-creatives/assemble-prompt';
import { generateAdCopy } from '@/lib/ad-creatives/generate-copy';
import type { AdPromptTemplate, KandyTemplate } from '@/lib/ad-creatives/types';
import { adPromptRowToWizardTemplate, wizardTemplateToKandy } from '@/lib/ad-creatives/wizard-template';

const bodySchema = z.object({
  templateVariations: z.array(z.object({
    templateId: z.string().uuid(),
    count: z.number().int().min(1).max(10),
  })).min(1),
  templateSource: z.enum(['kandy', 'custom']),
  productService: z.string().min(1).max(500),
  offer: z.string().max(300).optional(),
  aspectRatio: z.enum(['1:1', '9:16', '4:5']),
  onScreenTextMode: z.enum(['ai_generate', 'manual']),
  manualText: z.object({
    headline: z.string(),
    subheadline: z.string(),
    cta: z.string(),
  }).optional(),
});

export interface PromptPreview {
  templateId: string;
  templateName: string;
  templateImageUrl: string;
  variationIndex: number;
  copy: { headline: string; subheadline: string; cta: string };
  prompt: string;
  styleNotes: string;
}

/**
 * POST /api/clients/[id]/ad-creatives/preview-prompts
 *
 * Generate prompts and copy without actually generating images.
 * Returns an array of prompt previews that can be edited before generation.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { templateVariations, templateSource, productService, offer, aspectRatio, onScreenTextMode, manualText } = parsed.data;
  const admin = createAdminClient();

  try {
    // Resolve brand context
    const brandContext = await getBrandContext(clientId);

    const templateIds = templateVariations.map((tv) => tv.templateId);

    let templates: KandyTemplate[] = [];
    if (templateSource === 'kandy') {
      const { data } = await admin
        .from('kandy_templates')
        .select('*')
        .in('id', templateIds)
        .eq('is_active', true);
      templates = (data ?? []) as KandyTemplate[];
    } else {
      const { data } = await admin
        .from('ad_prompt_templates')
        .select('*')
        .eq('client_id', clientId)
        .in('id', templateIds);
      templates = (data ?? []).map((row) =>
        wizardTemplateToKandy(adPromptRowToWizardTemplate(row as AdPromptTemplate)),
      );
    }

    if (templates.length === 0) {
      return NextResponse.json({ error: 'No templates found' }, { status: 404 });
    }

    // Generate copy
    const maxCount = Math.max(...templateVariations.map((tv) => tv.count));
    let copyVariations: { headline: string; subheadline: string; cta: string }[];

    if (onScreenTextMode === 'ai_generate') {
      copyVariations = await generateAdCopy({
        brandContext,
        productService,
        offer: offer ?? null,
        count: maxCount,
      });
    } else {
      const text = manualText ?? { headline: '', subheadline: '', cta: '' };
      copyVariations = Array.from({ length: maxCount }, () => text);
    }

    // Build previews
    const previews: PromptPreview[] = [];

    for (const tv of templateVariations) {
      const template = templates.find((t: KandyTemplate) => t.id === tv.templateId);
      if (!template) continue;

      for (let i = 0; i < tv.count; i++) {
        const copy = copyVariations[i % copyVariations.length];

        const prompt = assembleImagePrompt({
          brandContext,
          promptSchema: template.prompt_schema,
          productService,
          offer: offer ?? null,
          onScreenText: copy,
          aspectRatio,
        });

        previews.push({
          templateId: tv.templateId,
          templateName: template.collection_name ?? 'Template',
          templateImageUrl: template.image_url ?? '',
          variationIndex: i,
          copy,
          prompt,
          styleNotes: extractStyleNotes(prompt),
        });
      }
    }

    return NextResponse.json({ previews });
  } catch (err) {
    console.error('[preview-prompts] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate previews' },
      { status: 500 },
    );
  }
}

function extractStyleNotes(prompt: string): string {
  // Extract a concise style summary from the full prompt
  const lines = prompt.split('\n').filter((l) => l.trim());
  const styleLines = lines.filter((l) =>
    /style|color|font|layout|composition|tone|mood/i.test(l),
  );
  return styleLines.slice(0, 5).join('\n') || 'Standard brand style';
}
