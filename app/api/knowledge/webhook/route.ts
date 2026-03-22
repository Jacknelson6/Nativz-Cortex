/**
 * POST /api/knowledge/webhook
 *
 * GitHub push webhook: re-sync configured knowledge graph sources when the pushed
 * repository matches KNOWLEDGE_GRAPH_SYNC_SOURCES (or the legacy default repo).
 *
 * @auth HMAC SHA-256 — GITHUB_KNOWLEDGE_WEBHOOK_SECRET, or GITHUB_VAULT_WEBHOOK_SECRET if unset
 * @returns Per-source sync stats when a source matches repository + branch
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  branchRefMatchesSource,
  getKnowledgeSyncSourceForRepo,
  getKnowledgeSyncSources,
} from '@/lib/knowledge/sync-sources';
import { syncKnowledgeSource } from '@/lib/knowledge/github-sync';

export const maxDuration = 120;

function webhookSecret(): string | undefined {
  return (
    process.env.GITHUB_KNOWLEDGE_WEBHOOK_SECRET?.trim() ||
    process.env.GITHUB_VAULT_WEBHOOK_SECRET?.trim()
  );
}

async function verifySignature(
  payload: string,
  signature: string | null,
): Promise<boolean> {
  const secret = webhookSecret();
  if (!secret) {
    console.error(
      '[knowledge-webhook] Set GITHUB_KNOWLEDGE_WEBHOOK_SECRET or GITHUB_VAULT_WEBHOOK_SECRET',
    );
    return false;
  }

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

  const expected = encoder.encode(`sha256=${hex}`);
  const actual = encoder.encode(signature);
  if (expected.byteLength !== actual.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < expected.byteLength; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

interface PushPayload {
  ref?: string;
  repository?: { full_name?: string };
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    if (!(await verifySignature(rawBody, signature))) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = request.headers.get('x-github-event');
    if (event === 'ping') {
      return NextResponse.json({ message: 'pong' });
    }
    if (event !== 'push') {
      return NextResponse.json({ message: `Ignored: ${event ?? 'unknown'}` });
    }

    const payload: PushPayload = JSON.parse(rawBody);
    const fullName = payload.repository?.full_name?.trim();
    const ref = payload.ref?.trim();
    if (!fullName || !ref) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const sources = getKnowledgeSyncSources().filter(
      (s) => s.repo.toLowerCase() === fullName.toLowerCase() && branchRefMatchesSource(ref, s),
    );

    if (sources.length === 0) {
      const hint = getKnowledgeSyncSourceForRepo(fullName)
        ? 'Branch mismatch — check branch in KNOWLEDGE_GRAPH_SYNC_SOURCES'
        : 'Repository not listed in KNOWLEDGE_GRAPH_SYNC_SOURCES';
      return NextResponse.json({
        message: 'No sync sources matched this push',
        hint,
        repository: fullName,
        ref,
      });
    }

    const results: Record<string, Awaited<ReturnType<typeof syncKnowledgeSource>>> = {};
    for (const source of sources) {
      const key = source.idNamespace ?? source.pathPrefixes.join(',');
      results[key] = await syncKnowledgeSource(source);
    }

    console.log(`[knowledge-webhook] Synced ${fullName}:`, results);

    return NextResponse.json({
      message: 'Synced',
      repository: fullName,
      ref,
      results,
    });
  } catch (error) {
    console.error('POST /api/knowledge/webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
