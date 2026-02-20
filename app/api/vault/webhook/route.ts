/**
 * POST /api/vault/webhook
 *
 * GitHub webhook receiver. When files are pushed to the vault repo,
 * changed markdown files are re-indexed for search.
 *
 * Security: Validates X-Hub-Signature-256 if GITHUB_VAULT_WEBHOOK_SECRET is set.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isVaultConfigured, readFile } from '@/lib/vault/github';
import { indexVaultFile } from '@/lib/vault/indexer';

async function verifySignature(
  payload: string,
  signature: string | null,
): Promise<boolean> {
  const secret = process.env.GITHUB_VAULT_WEBHOOK_SECRET;
  if (!secret) return true; // No secret = skip verification (dev)

  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return signature === `sha256=${hex}`;
}

interface PushEvent {
  ref: string;
  commits: Array<{
    added: string[];
    modified: string[];
    removed: string[];
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify signature
    const signature = request.headers.get('x-hub-signature-256');
    if (!(await verifySignature(rawBody, signature))) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Handle ping
    const event = request.headers.get('x-github-event');
    if (event === 'ping') {
      return NextResponse.json({ message: 'pong' });
    }
    if (event !== 'push') {
      return NextResponse.json({ message: `Ignored: ${event}` });
    }

    if (!isVaultConfigured()) {
      return NextResponse.json({ error: 'Vault not configured' }, { status: 503 });
    }

    const payload: PushEvent = JSON.parse(rawBody);

    // Collect all changed .md files
    const changedFiles = new Set<string>();
    const removedFiles = new Set<string>();

    for (const commit of payload.commits) {
      for (const file of [...commit.added, ...commit.modified]) {
        if (file.endsWith('.md')) changedFiles.add(file);
      }
      for (const file of commit.removed) {
        if (file.endsWith('.md')) removedFiles.add(file);
      }
    }

    if (changedFiles.size === 0 && removedFiles.size === 0) {
      return NextResponse.json({ message: 'No markdown changes' });
    }

    const results = [];

    // Re-index changed files
    for (const path of changedFiles) {
      const file = await readFile(path);
      if (file) {
        const result = await indexVaultFile(path, file.content);
        results.push({ ...result, action: 'indexed' });
      }
    }

    // Remove deleted files from index
    if (removedFiles.size > 0) {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const adminClient = createAdminClient();
      for (const path of removedFiles) {
        await adminClient.from('vault_documents').delete().eq('path', path);
        results.push({ path, chunks: 0, embedded: false, action: 'removed' });
      }
    }

    console.log(`[vault-webhook] Processed ${results.length} file(s)`);

    return NextResponse.json({
      message: `Processed ${results.length} file(s)`,
      results,
    });
  } catch (error) {
    console.error('POST /api/vault/webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
