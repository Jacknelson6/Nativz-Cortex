import { NextRequest, NextResponse } from 'next/server';
import { importFyxerEmails } from '@/lib/knowledge/fyxer-importer';
import { isServiceAccountConfigured } from '@/lib/google/service-account';
import { embedAllKnowledgeEntries } from '@/lib/ai/embeddings';

export const maxDuration = 60;

/**
 * GET/POST /api/cron/fyxer-import
 *
 * Vercel cron job (runs every 30 minutes): import Fyxer meeting recap emails from Gmail
 * into the knowledge base. Uses a Google service account with domain-wide delegation —
 * no AI tokens are consumed. Matches subjects to active clients (excluding Nativz-agency
 * rows unless `FYXER_INCLUDE_NATIVZ_CLIENTS=true`); unmatched → `fyxer-prospects` bucket.
 * Also generates embeddings for any entries missing them.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 * @returns {{ success: true, imported: number, skipped: number, errors: string[], embeddings: EmbedResult }}
 */
async function handleFyxerImport(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isServiceAccountConfigured()) {
      return NextResponse.json(
        {
          error:
            'Google service account not configured (GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_KEY_PATH)',
        },
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

export async function GET(request: NextRequest) {
  return handleFyxerImport(request);
}

export async function POST(request: NextRequest) {
  return handleFyxerImport(request);
}
