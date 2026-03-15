import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crawlClientWebsite } from '@/lib/knowledge/scraper';

const scrapeSchema = z.object({
  maxPages: z.number().int().min(1).max(100).optional().default(50),
  maxDepth: z.number().int().min(1).max(5).optional().default(3),
});

/**
 * POST /api/clients/[id]/knowledge/scrape
 *
 * Crawl the client's website and create web_page knowledge entries for each discovered page.
 * Respects the client's configured website_url. Returns 409 if a crawl is already in progress.
 *
 * @auth Required (admin)
 * @param id - Client UUID (client must have website_url set)
 * @body maxPages - Max pages to crawl (default: 50, max: 100)
 * @body maxDepth - Max link depth to follow (default: 3, max: 5)
 * @returns {{ message: string, count: number }}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;

    // Auth check
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin check
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch client to get website_url
    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .select('id, name, website_url')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    if (!client.website_url) {
      return NextResponse.json(
        { error: 'Client has no website URL configured' },
        { status: 400 }
      );
    }

    // Check for crawl already in progress
    const { data: existingCrawl } = await adminClient
      .from('client_knowledge_entries')
      .select('id')
      .eq('client_id', clientId)
      .eq('type', 'web_page')
      .eq('metadata->>status', 'processing')
      .limit(1);

    if (existingCrawl && existingCrawl.length > 0) {
      return NextResponse.json(
        { error: 'A crawl is already in progress for this client' },
        { status: 409 }
      );
    }

    // Parse optional body params
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // No body or invalid JSON — use defaults
    }

    const parsed = scrapeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { maxPages, maxDepth } = parsed.data;

    // Run the crawl
    const entries = await crawlClientWebsite({
      clientId,
      startUrl: client.website_url,
      maxPages,
      maxDepth,
      createdBy: user.id,
    });

    return NextResponse.json({
      message: `Successfully scraped ${entries.length} pages from ${client.name}`,
      count: entries.length,
    });
  } catch (error) {
    console.error('POST /api/clients/[id]/knowledge/scrape error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
