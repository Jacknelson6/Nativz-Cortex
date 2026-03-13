import { NextRequest, NextResponse } from 'next/server';
import { importFyxerEmails } from '@/lib/knowledge/fyxer-importer';
import { isServiceAccountConfigured } from '@/lib/google/service-account';
import { embedAllKnowledgeEntries } from '@/lib/ai/embeddings';

export const maxDuration = 60;

/**
 * Cron job: auto-import Fyxer meeting recap emails into the knowledge base.
 * Runs every 30 minutes. Uses a service account with domain-wide delegation
 * to access jack@nativz.io's Gmail. Zero AI tokens.
 *
 * Only imports meetings where the title contains a known client name.
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = request.headers.get('authorization');
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    if (!isServiceAccountConfigured()) {
      return NextResponse.json(
        { error: 'GOOGLE_SERVICE_ACCOUNT_KEY not configured' },
        { status: 400 },
      );
    }

    const result = await importFyxerEmails();

    console.log(
      `Fyxer import: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`,
    );

    // Generate embeddings for any entries missing them
    const embedResult = await embedAllKnowledgeEntries().catch(() => ({
      embedded: 0,
      failed: 0,
      skipped: 0,
    }));

    return NextResponse.json({ success: true, ...result, embeddings: embedResult });
  } catch (error) {
    console.error('POST /api/cron/fyxer-import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
