import { NextRequest, NextResponse } from 'next/server';
import { importFyxerEmails } from '@/lib/knowledge/fyxer-importer';
import { isServiceAccountConfigured } from '@/lib/google/service-account';
import { embedAllKnowledgeEntries } from '@/lib/ai/embeddings';

export const maxDuration = 60;

/**
 * POST /api/cron/fyxer-import
 *
 * Vercel cron job (runs every 30 minutes): import Fyxer meeting recap emails from Gmail
 * into the knowledge base. Uses a Google service account with domain-wide delegation —
 * no AI tokens are consumed. Only imports meetings where the title contains a known
 * client name. Also generates embeddings for any entries missing them.
 *
 * @auth Bearer CRON_SECRET (Vercel cron; optional — allows unauthenticated if not set)
 * @returns {{ success: true, imported: number, skipped: number, errors: string[], embeddings: EmbedResult }}
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
