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
import {
  getVercelEnvVar,
  upsertVercelEnvVar,
  vercelEnvSyncAvailable,
} from '@/lib/vercel/env';

/** Env vars we mirror two-way between the dashboard and Vercel. */
const VERCEL_SYNC_TARGETS = {
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
} as const;

type SyncProvider = keyof typeof VERCEL_SYNC_TARGETS;

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
  /**
   * Opt-in: pull the current Vercel env values into the DB instead of using
   * the `openrouter` / `openai` fields. UI "Use Vercel value" button posts
   * this. Values in `openrouter` / `openai` are ignored when this is truthy.
   */
  syncFromVercel: z
    .object({
      openrouter: z.boolean().optional(),
      openai: z.boolean().optional(),
    })
    .optional(),
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
 * Compare the DB-stored "default" key for a provider against the decrypted
 * value Vercel has for the mirrored env var. Returns a tiny status object the
 * UI renders as a pill ("synced" / "differs" / "no Vercel token").
 *
 * Read-only — it never writes. Writes happen in PATCH.
 */
async function vercelMirrorStatus(
  provider: SyncProvider,
  stored: LlmProviderKeysStored | undefined,
) {
  if (!vercelEnvSyncAvailable()) {
    return { available: false as const };
  }
  const envKey = VERCEL_SYNC_TARGETS[provider];
  const remote = await getVercelEnvVar(envKey);
  const dbBlock = (stored?.[provider] as Record<string, string | undefined> | undefined) ?? {};
  const dbValue = (dbBlock.default ?? dbBlock.ideas ?? '').trim();
  const remoteValue = remote?.value?.trim() ?? '';
  return {
    available: true as const,
    envKey,
    configured: Boolean(remoteValue),
    masked: maskApiKey(remoteValue),
    updatedAt: remote?.updatedAt ?? null,
    targets: remote?.target ?? [],
    differsFromDb: Boolean(remoteValue) && Boolean(dbValue) && remoteValue !== dbValue,
    dbEmpty: !dbValue,
  };
}

/**
 * GET /api/settings/llm-credentials
 * Masked keys + model ids + Vercel mirror status (admin only).
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

    // Parallel: read Vercel's current values so the UI can show
    // "synced" / "differs" status for each provider without a second round-trip.
    const [openrouterMirror, openaiMirror] = await Promise.all([
      vercelMirrorStatus('openrouter', stored),
      vercelMirrorStatus('openai', stored),
    ]);

    return NextResponse.json({
      openrouter: maskProviderBlock(stored.openrouter),
      openai: maskProviderBlock(stored.openai),
      nerdModel: (row?.nerd_model as string) ?? '',
      ideasModel: (row?.ideas_model as string) ?? '',
      updatedAt: row?.updated_at ?? null,
      vercelMirror: {
        openrouter: openrouterMirror,
        openai: openaiMirror,
      },
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

  const syncFromVercel = parsed.data.syncFromVercel ?? {};
  const hasAny =
    parsed.data.openrouter !== undefined ||
    parsed.data.openai !== undefined ||
    parsed.data.nerdModel !== undefined ||
    parsed.data.ideasModel !== undefined ||
    syncFromVercel.openrouter ||
    syncFromVercel.openai;
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

    // --- Sync-from-Vercel branch ---
    // If the caller asked for `syncFromVercel.openrouter = true`, we pull the
    // decrypted value out of Vercel and fan it into every bucket. This is the
    // "Vercel → DB" half of the bidirectional mirror.
    const pulledFromVercel: { openrouter?: string; openai?: string } = {};
    if (syncFromVercel.openrouter) {
      const remote = await getVercelEnvVar(VERCEL_SYNC_TARGETS.openrouter);
      const v = remote?.value?.trim() ?? '';
      if (!v) {
        return NextResponse.json(
          { error: 'Vercel has no OPENROUTER_API_KEY to sync from' },
          { status: 409 },
        );
      }
      pulledFromVercel.openrouter = v;
      next.openrouter = { default: v, topic_search: v, nerd: v };
    }
    if (syncFromVercel.openai) {
      const remote = await getVercelEnvVar(VERCEL_SYNC_TARGETS.openai);
      const v = remote?.value?.trim() ?? '';
      if (!v) {
        return NextResponse.json(
          { error: 'Vercel has no OPENAI_API_KEY to sync from' },
          { status: 409 },
        );
      }
      pulledFromVercel.openai = v;
      next.openai = { default: v, topic_search: v, nerd: v };
    }

    if (parsed.data.openrouter && !pulledFromVercel.openrouter) {
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

    if (parsed.data.openai && !pulledFromVercel.openai) {
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

    // --- DB → Vercel write-through ---
    // When the user (or the server) writes a provider key to the DB, mirror
    // the new "default" bucket value to the matching Vercel env var so the two
    // sources don't drift. No-ops when VERCEL_TOKEN isn't wired. If the user
    // is pulling FROM Vercel we skip the write — the values already match.
    const mirrorResults: Record<SyncProvider, string | null> = {
      openrouter: null,
      openai: null,
    };
    if (vercelEnvSyncAvailable()) {
      const writes: Array<Promise<void>> = [];
      for (const provider of ['openrouter', 'openai'] as const) {
        if (syncFromVercel[provider]) continue; // we pulled; no need to push
        if (parsed.data[provider] === undefined) continue; // field wasn't touched
        const block = next[provider] as Record<string, string | undefined> | undefined;
        const value = block?.default?.trim();
        if (!value) {
          // Key was cleared — leave the Vercel env alone. Deleting it silently
          // would be surprising; the user can remove it on Vercel themselves.
          mirrorResults[provider] = 'skipped (key cleared, Vercel untouched)';
          continue;
        }
        writes.push(
          upsertVercelEnvVar(VERCEL_SYNC_TARGETS[provider], value).then((res) => {
            mirrorResults[provider] = res.ok
              ? `vercel ${res.action}`
              : `vercel sync failed: ${res.error}`;
          }),
        );
      }
      await Promise.all(writes);
    }

    const { data: outRow } = await adminClient
      .from('agency_settings')
      .select('llm_provider_keys, nerd_model, ideas_model, updated_at')
      .eq('agency', 'nativz')
      .single();

    const storedOut = (outRow?.llm_provider_keys as LlmProviderKeysStored) ?? {};

    // Refresh mirror status so the UI's "differs" pill updates immediately.
    const [openrouterMirror, openaiMirror] = await Promise.all([
      vercelMirrorStatus('openrouter', storedOut),
      vercelMirrorStatus('openai', storedOut),
    ]);

    return NextResponse.json({
      openrouter: maskProviderBlock(storedOut.openrouter),
      openai: maskProviderBlock(storedOut.openai),
      nerdModel: (outRow?.nerd_model as string) ?? '',
      ideasModel: (outRow?.ideas_model as string) ?? '',
      updatedAt: outRow?.updated_at ?? null,
      vercelMirror: {
        openrouter: openrouterMirror,
        openai: openaiMirror,
      },
      mirrorResults,
    });
  } catch (err) {
    console.error('PATCH /api/settings/llm-credentials:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
