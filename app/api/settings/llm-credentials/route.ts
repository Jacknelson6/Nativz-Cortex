import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  clearLlmProviderKeysCache,
  maskApiKey,
  type LlmProviderKeysStored,
  type LlmProviderKeyBucket,
} from '@/lib/ai/provider-keys';

const keyField = z
  .union([z.string().min(8).max(800), z.null()])
  .optional();

const openAiKeyField = z
  .union([z.string().min(16).max(800), z.null()])
  .optional();

const PatchSchema = z.object({
  openrouter: z
    .object({
      default: keyField,
      topic_search: keyField,
      nerd: keyField,
    })
    .optional(),
  openai: z
    .object({
      default: openAiKeyField,
      topic_search: openAiKeyField,
      nerd: openAiKeyField,
    })
    .optional(),
  nerdModel: z.union([z.string().max(200), z.null()]).optional(),
  ideasModel: z.union([z.string().max(200), z.null()]).optional(),
});

function maskProviderBlock(stored: LlmProviderKeysStored['openrouter'] | LlmProviderKeysStored['openai']) {
  const legacy = stored as Record<string, string | undefined> | undefined;
  const buckets: LlmProviderKeyBucket[] = ['default', 'topic_search', 'nerd'];
  const out: Record<string, { configured: boolean; masked: string | null }> = {};
  for (const b of buckets) {
    const v =
      b === 'default'
        ? legacy?.default?.trim() || legacy?.ideas?.trim()
        : legacy?.[b]?.trim();
    out[b] = {
      configured: Boolean(v),
      masked: maskApiKey(v),
    };
  }
  return out;
}

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { user: null as null, adminClient: null as null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const adminClient = createAdminClient();
  const { data: userData } = await adminClient.from('users').select('role').eq('id', user.id).single();
  if (!userData || userData.role !== 'admin') {
    return { user: null, adminClient: null, error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { user, adminClient, error: null as null };
}

/**
 * GET /api/settings/llm-credentials
 * Masked keys + model ids (admin only).
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const adminClient = gate.adminClient!;

  try {
    const { data: row } = await adminClient
      .from('agency_settings')
      .select('llm_provider_keys, nerd_model, ideas_model, updated_at')
      .eq('agency', 'nativz')
      .single();

    const stored = (row?.llm_provider_keys as LlmProviderKeysStored) ?? {};
    return NextResponse.json({
      openrouter: maskProviderBlock(stored.openrouter),
      openai: maskProviderBlock(stored.openai),
      nerdModel: (row?.nerd_model as string) ?? '',
      ideasModel: (row?.ideas_model as string) ?? '',
      updatedAt: row?.updated_at ?? null,
    });
  } catch (err) {
    console.error('GET /api/settings/llm-credentials:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/llm-credentials
 * Set or clear per-bucket OpenRouter keys and optional Nerd / ideas models.
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const adminClient = gate.adminClient!;

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    );
  }

  const hasAny =
    parsed.data.openrouter !== undefined ||
    parsed.data.openai !== undefined ||
    parsed.data.nerdModel !== undefined ||
    parsed.data.ideasModel !== undefined;
  if (!hasAny) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    const { data: row } = await adminClient
      .from('agency_settings')
      .select('llm_provider_keys')
      .eq('agency', 'nativz')
      .single();

    const prev = (row?.llm_provider_keys as LlmProviderKeysStored) ?? {};
    const next: LlmProviderKeysStored = {
      ...prev,
      openrouter: { ...prev.openrouter },
      openai: { ...prev.openai },
    };

    if (parsed.data.openrouter) {
      const buckets: LlmProviderKeyBucket[] = ['default', 'topic_search', 'nerd'];
      for (const b of buckets) {
        const v = parsed.data.openrouter[b];
        if (v === undefined) continue;
        if (v === null) {
          delete next.openrouter![b];
        } else {
          next.openrouter![b] = v.trim();
        }
      }
      const or = next.openrouter as Record<string, string | undefined>;
      if (parsed.data.openrouter.default === null) {
        delete or.ideas;
      } else if (!or.default?.trim() && or.ideas?.trim()) {
        or.default = or.ideas.trim();
      }
      delete or.ideas;
    }

    if (parsed.data.openai) {
      const buckets: LlmProviderKeyBucket[] = ['default', 'topic_search', 'nerd'];
      for (const b of buckets) {
        const v = parsed.data.openai[b];
        if (v === undefined) continue;
        if (v === null) {
          delete next.openai![b];
        } else {
          next.openai![b] = v.trim();
        }
      }
      const oa = next.openai as Record<string, string | undefined>;
      if (parsed.data.openai.default === null) {
        delete oa.ideas;
      } else if (!oa.default?.trim() && oa.ideas?.trim()) {
        oa.default = oa.ideas.trim();
      }
      delete oa.ideas;
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      llm_provider_keys: next,
    };

    if (parsed.data.nerdModel !== undefined) {
      updatePayload.nerd_model = parsed.data.nerdModel === null || parsed.data.nerdModel === '' ? null : parsed.data.nerdModel.trim();
    }
    if (parsed.data.ideasModel !== undefined) {
      updatePayload.ideas_model = parsed.data.ideasModel === null || parsed.data.ideasModel === '' ? null : parsed.data.ideasModel.trim();
    }

    const { error: updateError } = await adminClient.from('agency_settings').update(updatePayload).eq('agency', 'nativz');

    if (updateError) {
      console.error('PATCH llm-credentials:', updateError);
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    clearLlmProviderKeysCache();

    const { data: outRow } = await adminClient
      .from('agency_settings')
      .select('llm_provider_keys, nerd_model, ideas_model, updated_at')
      .eq('agency', 'nativz')
      .single();

    const storedOut = (outRow?.llm_provider_keys as LlmProviderKeysStored) ?? {};

    return NextResponse.json({
      openrouter: maskProviderBlock(storedOut.openrouter),
      openai: maskProviderBlock(storedOut.openai),
      nerdModel: (outRow?.nerd_model as string) ?? '',
      ideasModel: (outRow?.ideas_model as string) ?? '',
      updatedAt: outRow?.updated_at ?? null,
    });
  } catch (err) {
    console.error('PATCH /api/settings/llm-credentials:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
