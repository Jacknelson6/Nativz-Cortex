import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { queueBrandDNAGeneration } from '@/lib/brand-dna/queue-generation';
import { rateLimitByUser } from '@/lib/security/rate-limit';
import { normalizeWebsiteUrl, isValidWebsiteUrl } from '@/lib/utils/normalize-website-url';

const bodySchema = z.object({
  websiteUrl: z
    .string()
    .min(1, 'Website URL is required')
    .transform((s) => normalizeWebsiteUrl(s))
    .refine((s) => isValidWebsiteUrl(s), { message: 'Invalid website URL' }),
  uploadedContent: z.string().nullish().optional(),
});

export const maxDuration = 300;

/**
 * POST /api/clients/[id]/brand-dna/generate
 *
 * Kick off Brand DNA generation for a client. Creates a job record and processes in background.
 *
 * @auth Required (admin)
 * @body websiteUrl - URL to crawl
 * @body uploadedContent - Optional text from uploaded files
 * @returns {{ jobId: string, status: 'generating' }}
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: actor } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!actor || actor.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Rate limit: 10 requests per minute per user for AI endpoints
    const rl = rateLimitByUser(user.id, '/api/clients/brand-dna/generate', 'ai');
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const fieldMsg = flat.fieldErrors.websiteUrl?.[0] ?? flat.formErrors[0];
      return NextResponse.json(
        {
          error: fieldMsg ?? 'Invalid input',
          details: flat.fieldErrors,
        },
        { status: 400 },
      );
    }

    const uploadedContent =
      parsed.data.uploadedContent === null || parsed.data.uploadedContent === undefined
        ? undefined
        : parsed.data.uploadedContent;

    // Verify client exists
    const { data: client } = await admin.from('clients').select('id').eq('id', clientId).single();
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    let jobId: string;
    try {
      const q = await queueBrandDNAGeneration({
        admin,
        clientId,
        websiteUrl: parsed.data.websiteUrl,
        userId: user.id,
        uploadedContent,
      });
      jobId = q.jobId;
    } catch (e) {
      console.error('[brand-dna/generate] Failed to queue job:', e);
      return NextResponse.json(
        {
          error: 'Failed to create generation job',
          hint: e instanceof Error ? e.message : 'Check that migration 040 (brand_dna_jobs) is applied.',
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ jobId, status: 'generating' });
  } catch (err) {
    console.error('[brand-dna/generate] Unhandled error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
