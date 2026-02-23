import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';

/**
 * POST /api/clients/backfill-industry
 * One-time backfill: analyze websites for all clients with industry = 'General'
 * and update both the DB and vault profiles.
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all active clients with industry = General and a website URL
    const { data: clients } = await adminClient
      .from('clients')
      .select('id, name, slug, website_url, industry')
      .eq('is_active', true)
      .or('industry.eq.General,industry.is.null');

    if (!clients || clients.length === 0) {
      return NextResponse.json({ message: 'No clients need industry backfill', updated: 0 });
    }

    const results: Array<{ name: string; industry: string; status: string }> = [];

    for (const client of clients) {
      if (!client.website_url) {
        results.push({ name: client.name, industry: 'General', status: 'skipped — no website' });
        continue;
      }

      try {
        // Fetch website
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        let html: string;
        try {
          const res = await fetch(client.website_url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NativzBot/1.0)' },
          });
          html = await res.text();
        } finally {
          clearTimeout(timeout);
        }

        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 3000);

        if (!text || text.length < 30) {
          results.push({ name: client.name, industry: 'General', status: 'skipped — not enough content' });
          continue;
        }

        const prompt = `What industry is this business in? Be specific but concise (2-5 words).

Website: ${client.website_url}
Business name: ${client.name}
Content: ${text}

Respond ONLY with JSON: {"industry": "Industry Name Here"}`;

        const aiResult = await createCompletion({
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 100,
        });

        const parsed = parseAIResponseJSON<{ industry: string }>(aiResult.text);
        const industry = parsed?.industry || 'General';

        if (industry && industry !== 'General') {
          await adminClient
            .from('clients')
            .update({ industry, updated_at: new Date().toISOString() })
            .eq('id', client.id);

          results.push({ name: client.name, industry, status: 'updated' });
        } else {
          results.push({ name: client.name, industry: 'General', status: 'no industry detected' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        results.push({ name: client.name, industry: 'General', status: `error: ${msg}` });
      }
    }

    const updated = results.filter((r) => r.status === 'updated').length;
    return NextResponse.json({ message: `Updated ${updated} of ${clients.length} clients`, results });
  } catch (error) {
    console.error('POST /api/clients/backfill-industry error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
